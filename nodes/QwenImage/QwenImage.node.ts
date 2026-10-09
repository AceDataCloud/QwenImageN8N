import { NodeConnectionTypes, NodeOperationError, OperationalError, UserError } from 'n8n-workflow';
import type { IDataObject, IExecuteFunctions, INodeExecutionData, INodeProperties, INodeType, INodeTypeDescription } from 'n8n-workflow';

const models = ['qwen-image-3.0', 'qwen-image-3.0-pro'];
const privateKeys = new Set([
  'actor_user_id', 'api_id', 'application_id', 'authorization_id', 'credential_id',
  'user_id', 'request', 'request_body', 'authorization', 'headers', 'api_key',
  'access_token', 'refresh_token', 'supplier', 'supplier_id', 'upstream', 'upstream_model',
  'actual_model', 'provider_route', 'secret', 'error',
]);

const properties: INodeProperties[] = [
  {
    displayName: 'Resource', name: 'resource', type: 'options', default: 'image', noDataExpression: true,
    options: [{ name: 'Image', value: 'image' }, { name: 'Task', value: 'task' }],
  },
  {
    displayName: 'Operation', name: 'operation', type: 'options', default: 'generate', noDataExpression: true,
    displayOptions: { show: { resource: ['image'] } },
    options: [
      { name: 'Edit', value: 'edit', action: 'Edit an image', description: 'Edit one to three public reference images' },
      { name: 'Generate', value: 'generate', action: 'Generate an image', description: 'Create one image from a prompt' },
    ],
  },
  {
    displayName: 'Operation', name: 'operation', type: 'options', default: 'get', noDataExpression: true,
    displayOptions: { show: { resource: ['task'] } },
    options: [
      { name: 'Get', value: 'get', action: 'Get a task', description: 'Retrieve one existing task' },
      { name: 'Get Many', value: 'getMany', action: 'Get many tasks', description: 'Retrieve up to 50 specific task IDs' },
    ],
  },
  {
    displayName: 'Prompt', name: 'prompt', type: 'string', default: '', required: true,
    typeOptions: { rows: 4 }, displayOptions: { show: { resource: ['image'] } },
    description: 'Describe the new image or the requested change',
  },
  {
    displayName: 'Model', name: 'model', type: 'options', default: 'qwen-image-3.0',
    displayOptions: { show: { resource: ['image'] } },
    options: [
      { name: 'Qwen Image 3.0', value: 'qwen-image-3.0' },
      { name: 'Qwen Image 3.0 Pro', value: 'qwen-image-3.0-pro' },
    ],
    description: 'Model selection changes the current price',
  },
  {
    displayName: 'Size', name: 'size', type: 'string', default: '1024*1024', required: true,
    displayOptions: { show: { resource: ['image'] } },
    description: 'Output dimensions, for example 1024*1024; use an asterisk',
  },
  {
    displayName: 'Image URLs', name: 'imageUrls', type: 'string', default: '', required: true,
    displayOptions: { show: { resource: ['image'], operation: ['edit'] } },
    description: 'One to three publicly accessible HTTPS image URLs, separated by commas or new lines; each input image affects price',
  },
  {
    displayName: 'Task ID', name: 'taskId', type: 'string', default: '', required: true,
    displayOptions: { show: { resource: ['task'], operation: ['get'] } },
    description: 'The task ID returned by Generate or Edit',
  },
  {
    displayName: 'Task IDs', name: 'taskIds', type: 'string', default: '', required: true,
    displayOptions: { show: { resource: ['task'], operation: ['getMany'] } },
    description: 'One to 50 task IDs, separated by commas or new lines',
  },
];

function object(value: unknown): IDataObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as IDataObject : {};
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new UserError(label + ' is required');
  return value.trim();
}

function publicUrl(value: string): string {
  if (!URL.canParse(value)) throw new UserError('Each image URL must be a public HTTPS URL');
  const url = new URL(value);
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password)
    throw new UserError('Each image URL must be a public HTTPS URL without credentials');
  return value;
}

function imageUrlsInput(value: unknown): string[] {
  const urls = requiredText(value, 'Image URLs').split(/[,\n]/).map(v => v.trim()).filter(Boolean);
  if (urls.length < 1 || urls.length > 3) throw new UserError('Provide one to three image URLs');
  return urls.map(publicUrl);
}

function taskIdsInput(value: unknown): string[] {
  const ids = requiredText(value, 'Task IDs').split(/[,\n]/).map(v => v.trim()).filter(Boolean);
  if (ids.length < 1 || ids.length > 50) throw new UserError('Provide one to 50 task IDs');
  return ids;
}

export function imageBody(get: (name: string) => unknown, operation: string): IDataObject {
  if (operation !== 'generate' && operation !== 'edit') throw new UserError('Select a supported image operation');
  const model = requiredText(get('model'), 'Model');
  if (!models.includes(model)) throw new UserError('Select a supported Qwen Image model');
  const prompt = requiredText(get('prompt'), 'Prompt');
  if (prompt.length > 18000) throw new UserError('Prompt must be 18000 characters or fewer');
  const size = requiredText(get('size'), 'Size');
  if (!/^\d+\*\d+$/.test(size)) throw new UserError('Size must use width*height, for example 1024*1024');
  const body: IDataObject = { model, prompt, size, n: 1, watermark: false, async: true };
  if (operation === 'edit') body.image_urls = imageUrlsInput(get('imageUrls'));
  return body;
}

function publicData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(publicData);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !privateKeys.has(key.toLowerCase())
      && !/(^internal(?:_|$)|supplier|upstream|(?:^|_)secret(?:_|$))/.test(key.toLowerCase()))
      .map(([key, item]) => [key, publicData(item)]),
  );
}

function mediaUrls(value: unknown): string[] {
  const found: string[] = [];
  function walk(node: unknown): void {
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (!node || typeof node !== 'object') return;
    for (const [key, item] of Object.entries(node)) {
      if ((key === 'image_url' || key === 'url') && typeof item === 'string' && /^https:\/\//.test(item))
        found.push(item);
      else if (typeof item === 'object') walk(item);
    }
  }
  walk(value);
  return [...new Set(found)];
}

export function taskResult(record: IDataObject): IDataObject {
  const response = object(record.response);
  const state = String(record.state ?? record.status ?? response.status ?? '').toLowerCase();
  const data = publicData(response.data ?? record.data ?? null);
  const error = object(response.error ?? record.error);
  const unfinished = Object.prototype.hasOwnProperty.call(record, 'finished_at') && record.finished_at === null;
  const failed = !unfinished && (response.success === false || record.success === false
    || Boolean(response.error ?? record.error)
    || ['failed', 'error', 'cancelled', 'canceled', 'rejected'].includes(state));
  const finished = Boolean(record.finished_at);
  const urls = mediaUrls(data);
  const complete = !failed && (['succeeded', 'success', 'completed', 'complete'].includes(state)
    || (finished && response.success === true) || (finished && urls.length > 0));
  return {
    taskId: record.id ?? record.task_id ?? '',
    status: failed ? 'failed' : complete ? 'succeeded' : 'processing',
    finished: failed || complete,
    successful: failed ? false : complete ? true : null,
    imageUrls: complete ? urls : [],
    data: complete ? data as IDataObject | IDataObject[] | null : null,
    error: failed ? {
      code: typeof error.code === 'string' && /^[a-z0-9_-]{1,64}$/i.test(error.code) ? error.code : 'task_failed',
      message: 'The task failed; use the task or trace ID to inspect it.',
    } : null,
    traceId: record.trace_id ?? response.trace_id ?? null,
    cost: publicData(response.cost ?? null) as IDataObject | null,
  };
}

function requestFailure(error: unknown): OperationalError {
  const value = error && typeof error === 'object' ? error as {
    httpCode?: unknown; statusCode?: unknown; response?: { statusCode?: unknown; status?: unknown };
  } : {};
  const code = String(value.httpCode ?? value.statusCode ?? value.response?.statusCode ?? value.response?.status ?? '');
  const status = /^\d{3}$/.test(code) ? code : '';
  return new OperationalError(status
    ? 'AceDataCloud returned HTTP ' + status + '. Check the task or request history before retrying.'
    : 'AceDataCloud request did not complete. Check task or request history before retrying; generation may already have been charged.');
}

async function request(context: IExecuteFunctions, endpoint: string, body: IDataObject): Promise<IDataObject> {
  let result: unknown;
  try {
    result = await context.helpers.httpRequestWithAuthentication.call(context, 'aceDataQwenImageApi', {
      method: 'POST', url: 'https://api.acedata.cloud' + endpoint, body,
      json: true, disableFollowRedirect: true, timeout: 60000,
    });
  } catch (error) { throw requestFailure(error); }
  if (!result || typeof result !== 'object' || Array.isArray(result))
    throw new OperationalError('The service returned an unexpected response');
  const value = object(result);
  if (value.success === false || value.error)
    throw new OperationalError('The service rejected the request. Inspect its task or trace ID.');
  return value;
}

export class QwenImage implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Qwen Image by AceDataCloud', name: 'qwenImage',
    icon: { light: 'file:icon.svg', dark: 'file:icon.dark.svg' },
    group: ['transform'], version: 1,
    subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
    description: 'Generate or edit Qwen Image pictures and retrieve the same task until it finishes',
    defaults: { name: 'Qwen Image by AceDataCloud' },
    inputs: [NodeConnectionTypes.Main], outputs: [NodeConnectionTypes.Main],
    usableAsTool: true, credentials: [{ name: 'aceDataQwenImageApi', required: true }], properties,
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const output: INodeExecutionData[] = [];
    for (let index = 0; index < this.getInputData().length; index++) {
      try {
        try {
          const credentials = await this.getCredentials('aceDataQwenImageApi');
          if (typeof credentials.apiToken !== 'string' || !credentials.apiToken.trim())
            throw new UserError('Missing API token');
        } catch { throw new NodeOperationError(this.getNode(), 'A Qwen Image by AceDataCloud credential is required.'); }

        const resource = this.getNodeParameter('resource', index) as string;
        const operation = this.getNodeParameter('operation', index) as string;
        if (resource === 'task') {
          const body: IDataObject = operation === 'get'
            ? { action: 'retrieve', id: requiredText(this.getNodeParameter('taskId', index), 'Task ID') }
            : operation === 'getMany'
              ? { action: 'retrieve_batch', ids: taskIdsInput(this.getNodeParameter('taskIds', index)) }
              : {};
          if (!body.action) throw new NodeOperationError(this.getNode(), 'Select a supported task operation');
          const result = await request(this, '/qwen-image/tasks', body);
          const records = operation === 'getMany' ? result.items : [result];
          if (!Array.isArray(records)) throw new NodeOperationError(this.getNode(), 'The service returned an unexpected task list');
          for (const item of records) {
            const record = object(item);
            if (!record.id && !record.task_id) throw new NodeOperationError(this.getNode(), 'The task was not found');
            output.push({ json: taskResult(record), pairedItem: { item: index } });
          }
          continue;
        }
        if (resource !== 'image') throw new NodeOperationError(this.getNode(), 'Select a supported resource');
        const body = imageBody(name => this.getNodeParameter(name, index), operation);
        const result = await request(this, '/qwen-image/images', body);
        const taskId = result.task_id ?? object(result.task).id;
        if (typeof taskId !== 'string' || !taskId)
          throw new NodeOperationError(this.getNode(), 'The service did not return a task ID');
        output.push({
          json: { taskId, status: 'submitted', finished: false, successful: null, traceId: result.trace_id ?? null },
          pairedItem: { item: index },
        });
      } catch (error) {
        if (!this.continueOnFail())
          throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: index });
        output.push({ json: { error: (error as Error).message }, pairedItem: { item: index } });
      }
    }
    return [output];
  }
}
