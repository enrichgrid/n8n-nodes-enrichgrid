# n8n-nodes-enrichgrid

This is an n8n community node. It lets you use [EnrichGrid](https://enrichgrid.com) in your n8n workflows.

EnrichGrid is a LinkedIn data API: send a LinkedIn profile, company or school URL and get structured JSON back (work history with each employer's firmographics, education, skills, exact connection and follower counts, company size, industry, HQ and more). You can also search people by title, company, location and other filters. You pay 1 credit per found record; not-found results are free.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/sustainable-use-license/) workflow automation platform.

[Installation](#installation)
[Operations](#operations)
[Credentials](#credentials)
[Compatibility](#compatibility)
[Usage](#usage)
[Resources](#resources)
[Version history](#version-history)

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation. The package name is `n8n-nodes-enrichgrid`.

## Operations

| Resource | Operation | What it does | Cost |
|---|---|---|---|
| Person | Enrich | Full profile from a LinkedIn profile URL, slug or ID | 1 credit if found |
| Person | Search | People matching filters (title, country, city, company, past company, company size, industry, school, career years, tenure). Returns LinkedIn profile URLs, 10 per page | 1 credit per page with results |
| Company | Enrich | Firmographics from a LinkedIn company URL, slug or numeric ID | 1 credit if found |
| School | Enrich | School details from a LinkedIn school URL, slug or numeric ID | 1 credit if found |
| Account | Get | Credit balance, plan and rate limit | Free |

Enrich operations options:

- **Simplify** (on by default): returns the main fields as one flat object. Turn it off to get the full nested response (work history, education, skills, locations and so on).
- **Fresh Data**: skip the 30-day cache and collect the record from LinkedIn right now (same price, slower).
- **Max Wait (Seconds)**: a few records take longer to collect. The node keeps checking for up to this many seconds (90 by default) before it returns the pending lookup.

The node waits and retries automatically when you hit your plan's requests-per-second limit (HTTP 429) or when capacity is briefly busy (HTTP 503, nothing is charged).

The node can also be used as a tool by n8n AI agents.

## Credentials

1. Create a free account at [enrichgrid.com/signup](https://enrichgrid.com/signup) (50 free credits, no card).
2. Open **Dashboard → API keys** and copy your key.
3. In n8n, create an **EnrichGrid API** credential and paste the key. n8n checks it against `GET /v1/me`.

The key is sent in the `x-api-key` header to `https://enrichgrid.com`.

## Compatibility

Built with `@n8n/node-cli` (`n8nNodesApiVersion` 1) for n8n 1.0 and later, self-hosted or n8n Cloud with community nodes enabled.

## Usage

**Enrich a sheet of LinkedIn URLs**

1. Read rows from Google Sheets, Airtable or a CSV.
2. Add an **EnrichGrid** node: Resource *Person*, Operation *Enrich*, and set **LinkedIn URL or ID** to an expression such as `{{ $json.linkedin_url }}`.
3. Write `first_name`, `last_name`, `headline`, `current_title`, `current_company_name`, `location` or any other field back to your sheet or CRM.

**Build a lead list**

1. EnrichGrid, Resource *Person*, Operation *Search*, with filters like:

   ```json
   {
     "title": { "any": ["ceo", "founder"], "zones": ["current"] },
     "country": ["US"],
     "company_size": { "min": 11, "max": 200 }
   }
   ```

2. Connect a second EnrichGrid node (Person → Enrich) with `{{ $json.linkedin_url }}` to get each full profile.

**Company research**

Use Resource *Company*, Operation *Enrich* with a URL like `https://www.linkedin.com/company/microsoft` to get industry, headcount, headcount range, HQ, website, specialties and follower count.

All filters are described in the [API reference](https://enrichgrid.com/api-docs).

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
- [EnrichGrid API reference](https://enrichgrid.com/api-docs)
- [EnrichGrid integrations guide](https://enrichgrid.com/integrations)
- Support: support@enrichgrid.com

## Version history

### 0.1.1

Published from GitHub Actions with npm provenance. No functional changes.

### 0.1.0

First release: Person (Enrich, Search), Company (Enrich), School (Enrich), Account (Get).
