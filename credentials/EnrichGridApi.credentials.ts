import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class EnrichGridApi implements ICredentialType {
	name = 'enrichGridApi';

	displayName = 'EnrichGrid API';

	icon: Icon = { light: 'file:enrichgrid.light.svg', dark: 'file:enrichgrid.dark.svg' };

	documentationUrl = 'https://enrichgrid.com/api-docs';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			description:
				'Your EnrichGrid API key. Create one for free at https://enrichgrid.com/signup, then copy it from Dashboard → API keys.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'x-api-key': '={{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://enrichgrid.com',
			url: '/v1/me',
			method: 'GET',
		},
	};
}
