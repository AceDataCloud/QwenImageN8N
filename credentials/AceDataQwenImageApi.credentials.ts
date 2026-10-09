import type { IAuthenticateGeneric, ICredentialTestRequest, ICredentialType, INodeProperties } from 'n8n-workflow';

export class AceDataQwenImageApi implements ICredentialType {
  name = 'aceDataQwenImageApi';
  displayName = 'Qwen Image by AceDataCloud API';
  documentationUrl = 'https://github.com/AceDataCloud/QwenImageN8N#3-save-the-credential-in-n8n';
  icon = 'file:../nodes/QwenImage/icon.svg' as const;
  properties: INodeProperties[] = [
    {
      displayName: 'API Token', name: 'apiToken', type: 'string',
      typeOptions: { password: true }, default: '', required: true,
      description: 'An AceDataCloud application API token with Qwen Image access',
    },
  ];
  authenticate: IAuthenticateGeneric = {
    type: 'generic', properties: { headers: { Authorization: '=Bearer {{$credentials.apiToken}}' } },
  };
  test: ICredentialTestRequest = {
    request: {
      baseURL: 'https://api.acedata.cloud', url: '/qwen-image/tasks', method: 'POST',
      body: { action: 'retrieve', id: '00000000-0000-0000-0000-000000000000' },
    },
  };
}
