import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	INodeExecutionData,
	INodeProperties,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError, sleep } from 'n8n-workflow';

const BASE_URL = 'https://enrichgrid.com';
const POLL_INTERVAL_MS = 2500;
const MAX_RETRIES = 6;

/** How long to wait before retrying a failed request, or null if it should not be retried. */
function retryDelayMs(error: unknown): number | null {
	const err = (error ?? {}) as {
		httpCode?: string | number;
		statusCode?: number;
		response?: { status?: number; headers?: Record<string, string | undefined> };
	};
	const status = Number(err.httpCode ?? err.response?.status ?? err.statusCode);
	if (status !== 429 && status !== 503) return null;
	const header = Number(err.response?.headers?.['retry-after']);
	const seconds = Number.isFinite(header) && header > 0 ? header : status === 429 ? 1 : 5;
	return Math.min(seconds, 30) * 1000;
}

const identifierField = (
	resource: string,
	placeholder: string,
	description: string,
): INodeProperties => ({
	displayName: 'LinkedIn URL or ID',
	name: 'identifier',
	type: 'string',
	required: true,
	default: '',
	placeholder,
	description,
	displayOptions: { show: { resource: [resource], operation: ['enrich'] } },
});

const enrichOptions = (resource: string): INodeProperties => ({
	displayName: 'Options',
	name: 'options',
	type: 'collection',
	placeholder: 'Add Option',
	default: {},
	displayOptions: { show: { resource: [resource], operation: ['enrich'] } },
	options: [
		{
			displayName: 'Fresh Data',
			name: 'live',
			type: 'boolean',
			default: false,
			description:
				'Whether to skip the 30-day cache and collect the record fresh from LinkedIn (same price, slower)',
		},
		{
			displayName: 'Max Wait (Seconds)',
			name: 'maxWait',
			type: 'number',
			typeOptions: { minValue: 0, maxValue: 300 },
			default: 90,
			description:
				'Rare records take longer to collect. How long to keep checking for the result before returning the pending lookup. 0 returns immediately.',
		},
	],
});

const simplifyField = (resource: string): INodeProperties => ({
	displayName: 'Simplify',
	name: 'simplify',
	type: 'boolean',
	default: true,
	description:
		'Whether to return only the main fields as a flat object instead of the full nested response',
	displayOptions: { show: { resource: [resource], operation: ['enrich'] } },
});

function flatten(lookup: IDataObject, recordKey: string): IDataObject {
	const out: IDataObject = {
		found: lookup.found,
		status: lookup.status,
		identifier: lookup.identifier,
		credits_charged: lookup.credits_charged,
	};
	const record = lookup[recordKey];
	if (record && typeof record === 'object' && !Array.isArray(record)) {
		for (const [key, value] of Object.entries(record as IDataObject)) {
			if (value === null || typeof value !== 'object') out[key] = value;
		}
	}
	if (typeof out.slug === 'string' && out.slug) {
		const path = recordKey === 'profile' ? 'in' : recordKey;
		out.linkedin_url = `https://www.linkedin.com/${path}/${out.slug}`;
	}
	return out;
}

export class EnrichGrid implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'EnrichGrid',
		name: 'enrichGrid',
		icon: { light: 'file:enrichgrid.light.svg', dark: 'file:enrichgrid.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description:
			'Enrich LinkedIn profiles, companies and schools, and search people with the EnrichGrid API',
		defaults: { name: 'EnrichGrid' },
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'enrichGridApi', required: true }],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Account', value: 'account' },
					{ name: 'Company', value: 'company' },
					{ name: 'Person', value: 'person' },
					{ name: 'School', value: 'school' },
				],
				default: 'person',
			},

			// ---------------- Person
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['person'] } },
				options: [
					{
						name: 'Enrich',
						value: 'enrich',
						description: 'Get the full profile from a LinkedIn profile URL',
						action: 'Enrich a person',
					},
					{
						name: 'Search',
						value: 'search',
						description: 'Find people by title, company, location and more',
						action: 'Search people',
					},
				],
				default: 'enrich',
			},
			identifierField(
				'person',
				'https://www.linkedin.com/in/williamhgates',
				'LinkedIn profile URL, the slug after /in/, or the profile ID. Costs 1 credit only when the profile is found.',
			),
			enrichOptions('person'),
			simplifyField('person'),
			{
				displayName: 'Filters (JSON)',
				name: 'filters',
				type: 'json',
				required: true,
				default:
					'{\n  "title": { "any": ["ceo", "founder"], "zones": ["current"] },\n  "country": ["US"],\n  "company_size": { "min": 11, "max": 200 }\n}',
				description:
					'Search criteria, combined with AND: country, city, title, company, past_company, company_size, company_industry_id, company_has_website, industry_id, school, career_years, tenure_years. See https://enrichgrid.com/api-docs.',
				displayOptions: { show: { resource: ['person'], operation: ['search'] } },
			},
			{
				displayName: 'Return All',
				name: 'returnAll',
				type: 'boolean',
				default: false,
				description: 'Whether to return all results or only up to a given limit',
				displayOptions: { show: { resource: ['person'], operation: ['search'] } },
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				typeOptions: { minValue: 1 },
				default: 50,
				description: 'Max number of results to return',
				displayOptions: {
					show: { resource: ['person'], operation: ['search'], returnAll: [false] },
				},
			},

			// ---------------- Company
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['company'] } },
				options: [
					{
						name: 'Enrich',
						value: 'enrich',
						description: 'Get firmographics from a LinkedIn company URL',
						action: 'Enrich a company',
					},
				],
				default: 'enrich',
			},
			identifierField(
				'company',
				'https://www.linkedin.com/company/microsoft',
				'LinkedIn company URL, its slug, or the numeric company ID. Costs 1 credit only when the company is found.',
			),
			enrichOptions('company'),
			simplifyField('company'),

			// ---------------- School
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['school'] } },
				options: [
					{
						name: 'Enrich',
						value: 'enrich',
						description: 'Get details from a LinkedIn school URL',
						action: 'Enrich a school',
					},
				],
				default: 'enrich',
			},
			identifierField(
				'school',
				'https://www.linkedin.com/school/stanford-university/',
				'LinkedIn school URL, its slug, or the numeric school ID. Costs 1 credit only when the school is found.',
			),
			enrichOptions('school'),
			simplifyField('school'),

			// ---------------- Account
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['account'] } },
				options: [
					{
						name: 'Get',
						value: 'get',
						description: 'Get your credit balance, plan and rate limit',
						action: 'Get account balance',
					},
				],
				default: 'get',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		const request = async (
			method: IHttpRequestMethods,
			path: string,
			body?: IDataObject,
		): Promise<IDataObject> => {
			const options: IHttpRequestOptions = {
				method,
				url: `${BASE_URL}${path}`,
				json: true,
			};
			if (body) options.body = body;
			// 429 (plan rate limit) and 503 (busy, nothing charged) are safe to retry after a short wait.
			for (let attempt = 0; ; attempt++) {
				try {
					return (await this.helpers.httpRequestWithAuthentication.call(
						this,
						'enrichGridApi',
						options,
					)) as IDataObject;
				} catch (error) {
					const waitMs = retryDelayMs(error);
					if (waitMs === null || attempt >= MAX_RETRIES) {
						throw new NodeApiError(this.getNode(), error as JsonObject);
					}
					await sleep(waitMs);
				}
			}
		};

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;

				if (resource === 'account') {
					returnData.push({ json: await request('GET', '/v1/me'), pairedItem: { item: i } });
					continue;
				}

				if (resource === 'person' && operation === 'search') {
					const raw = this.getNodeParameter('filters', i) as string | IDataObject;
					let filters: IDataObject;
					try {
						filters = typeof raw === 'string' ? (JSON.parse(raw) as IDataObject) : raw;
					} catch {
						throw new NodeOperationError(this.getNode(), 'Filters must be valid JSON', {
							itemIndex: i,
						});
					}
					const returnAll = this.getNodeParameter('returnAll', i) as boolean;
					const limit = returnAll ? Infinity : (this.getNodeParameter('limit', i) as number);
					let cursor: string | null = null;
					let count = 0;
					do {
						const page = await request('POST', '/v1/search', { filters, cursor });
						const slugs = (page.slugs as string[] | undefined) ?? [];
						for (const slug of slugs) {
							if (count >= limit) break;
							returnData.push({
								json: { slug, linkedin_url: `https://www.linkedin.com/in/${slug}` },
								pairedItem: { item: i },
							});
							count++;
						}
						cursor = (page.next_cursor as string | null | undefined) ?? null;
						if (slugs.length === 0) break;
					} while (cursor && count < limit);
					continue;
				}

				// Enrich: person, company or school
				const identifier = (this.getNodeParameter('identifier', i) as string).trim();
				if (!identifier) {
					throw new NodeOperationError(this.getNode(), 'LinkedIn URL or ID is empty', {
						itemIndex: i,
					});
				}
				const options = this.getNodeParameter('options', i, {}) as {
					live?: boolean;
					maxWait?: number;
				};
				const simplify = this.getNodeParameter('simplify', i, true) as boolean;

				let lookup = await request('POST', `/v1/enrich/${resource}`, {
					identifier,
					live: options.live ?? false,
				});
				const deadline = Date.now() + (options.maxWait ?? 90) * 1000;
				while (lookup.status === 'pending' && Date.now() < deadline) {
					await sleep(POLL_INTERVAL_MS);
					lookup = await request('GET', `/v1/lookups/${lookup.id as string}`);
				}

				const recordKey = resource === 'person' ? 'profile' : resource;
				returnData.push({
					json: simplify && lookup.status === 'done' ? flatten(lookup, recordKey) : lookup,
					pairedItem: { item: i },
				});
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: i },
					});
					continue;
				}
				if (error instanceof NodeOperationError) {
					throw new NodeOperationError(this.getNode(), error.message, { itemIndex: i });
				}
				throw new NodeApiError(this.getNode(), error as JsonObject, { itemIndex: i });
			}
		}

		return [returnData];
	}
}
