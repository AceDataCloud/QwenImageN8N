const { test } = require('node:test');
const assert = require('node:assert/strict');
const { QwenImage, imageBody, taskResult } = require('../dist/nodes/QwenImage/QwenImage.node.js');
const { AceDataQwenImageApi } = require('../dist/credentials/AceDataQwenImageApi.credentials.js');

const generate = {
  resource: 'image', operation: 'generate', prompt: 'A blue paper sphere on cream',
  model: 'qwen-image-3.0', size: '1024*1024',
};

function context(parameters, responses = [], { continueOnFail = false, credentials = true } = {}) {
  const calls = [];
  let next = 0;
  return {
    calls,
    getInputData: () => parameters.map(() => ({ json: {} })),
    getNode: () => ({
      name: 'Qwen Image', type: '@acedatacloud/n8n-nodes-qwen-image.qwenImage',
      typeVersion: 1, position: [0, 0], parameters: {},
    }),
    getNodeParameter: (name, index) => parameters[index][name],
    getCredentials: async () => credentials ? { apiToken: 'test-token' } : Promise.reject(new Error('missing')),
    continueOnFail: () => continueOnFail,
    helpers: {
      httpRequestWithAuthentication: async (credential, request) => {
        calls.push({ credential, ...request });
        const response = responses[next++];
        if (response instanceof Error) throw response;
        return response;
      },
    },
  };
}

const node = new QwenImage();

test('generation makes one asynchronous Qwen Image request and preserves input pairing', async () => {
  const ctx = context([generate], [{ task_id: 'task-1', trace_id: 'trace-1' }]);
  const [items] = await node.execute.call(ctx);
  assert.equal(ctx.calls.length, 1);
  assert.equal(ctx.calls[0].credential, 'aceDataQwenImageApi');
  assert.equal(ctx.calls[0].url, 'https://api.acedata.cloud/qwen-image/images');
  assert.equal(ctx.calls[0].disableFollowRedirect, true);
  assert.deepEqual(ctx.calls[0].body, {
    model: 'qwen-image-3.0', prompt: generate.prompt, size: '1024*1024',
    n: 1, watermark: false, async: true,
  });
  assert.deepEqual(items[0], {
    json: { taskId: 'task-1', status: 'submitted', finished: false, successful: null, traceId: 'trace-1' },
    pairedItem: { item: 0 },
  });
});

test('invalid model, prompt and size stop before a paid request', async () => {
  for (const bad of [
    { model: 'unlisted-model' }, { prompt: '' }, { prompt: 'x'.repeat(18001) },
    { size: '1024x1024' }, { size: '' },
  ]) {
    const ctx = context([{ ...generate, ...bad }]);
    await assert.rejects(node.execute.call(ctx));
    assert.equal(ctx.calls.length, 0);
  }
});

test('editing accepts one to three HTTPS references and does not leak obsolete parameters', async () => {
  const edit = { ...generate, operation: 'edit', imageUrls: 'https://example.com/a.png,\nhttps://example.com/b.png' };
  const ctx = context([edit], [{ task_id: 'edit-1' }]);
  await node.execute.call(ctx);
  assert.deepEqual(ctx.calls[0].body.image_urls, ['https://example.com/a.png', 'https://example.com/b.png']);
  assert.equal(ctx.calls[0].body.n, 1);
  for (const urls of ['', 'file:///tmp/a.png', 'https://user:pass@example.com/a.png',
    'https://example.com/a.png,https://example.com/b.png,https://example.com/c.png,https://example.com/d.png']) {
    const bad = context([{ ...edit, imageUrls: urls }]);
    await assert.rejects(node.execute.call(bad));
    assert.equal(bad.calls.length, 0);
  }
});

test('task results distinguish pending, success and sanitized failure', () => {
  assert.equal(taskResult({ id: 'a', finished_at: null }).status, 'processing');
  assert.equal(taskResult({ id: 'a', finished_at: null, response: {
    success: false, error: { code: 'pending', message: 'private detail' },
  } }).status, 'processing');
  const success = taskResult({
    id: 'a', finished_at: '2026-10-09T00:00:00Z', actor_user_id: 'private',
    response: { success: true, data: [{ image_url: 'https://cdn.acedata.cloud/a.png',
      supplier: 'private', nested: { credential_id: 'private', safe: 'yes' } }],
    cost: { amount: 0.2, currency: 'credit' } },
  });
  assert.equal(success.status, 'succeeded');
  assert.deepEqual(success.imageUrls, ['https://cdn.acedata.cloud/a.png']);
  assert.equal(success.cost.amount, 0.2);
  assert.doesNotMatch(JSON.stringify(success), /private/);
  const failure = taskResult({ id: 'b', finished_at: 'now', response: {
    success: false, error: { code: 'rejected', message: 'private supplier detail' },
  } });
  assert.equal(failure.successful, false);
  assert.equal(failure.error.code, 'rejected');
  assert.doesNotMatch(JSON.stringify(failure), /private supplier detail/);
});

test('query and batch query never submit an image and preserve task links', async () => {
  const ctx = context([{ resource: 'task', operation: 'getMany', taskIds: 'a, b' }],
    [{ items: [{ id: 'a' }, { id: 'b', finished_at: 'now',
      response: { success: true, data: [{ image_url: 'https://cdn.acedata.cloud/b.png' }] } }] }]);
  const [items] = await node.execute.call(ctx);
  assert.equal(ctx.calls[0].url, 'https://api.acedata.cloud/qwen-image/tasks');
  assert.deepEqual(ctx.calls[0].body, { action: 'retrieve_batch', ids: ['a', 'b'] });
  assert.equal(items.length, 2);
  assert.deepEqual(items[1].pairedItem, { item: 0 });
  const one = context([{ resource: 'task', operation: 'get', taskId: 'a' }], [{ id: 'a' }]);
  await node.execute.call(one);
  assert.deepEqual(one.calls[0].body, { action: 'retrieve', id: 'a' });
});

test('missing credentials and malformed task IDs stop before a service request', async () => {
  const missing = context([generate], [], { credentials: false });
  await assert.rejects(node.execute.call(missing), /credential is required/i);
  assert.equal(missing.calls.length, 0);
  for (const parameters of [
    { resource: 'task', operation: 'get', taskId: '' },
    { resource: 'task', operation: 'getMany', taskIds: '' },
  ]) {
    const bad = context([parameters]);
    await assert.rejects(node.execute.call(bad));
    assert.equal(bad.calls.length, 0);
  }
});

test('an uncertain generation transport failure is not retried', async () => {
  const ctx = context([generate, generate], [new Error('connection lost'), { task_id: 'second' }],
    { continueOnFail: true });
  const [items] = await node.execute.call(ctx);
  assert.equal(ctx.calls.length, 2);
  assert.match(items[0].json.error, /request history/i);
  assert.equal(items[1].json.taskId, 'second');
});

test('HTTP failures retain status but suppress upstream detail', async () => {
  const upstream = Object.assign(new Error('private supplier host and secret'), { response: { statusCode: 429 } });
  const ctx = context([generate], [upstream], { continueOnFail: true });
  const [items] = await node.execute.call(ctx);
  assert.equal(ctx.calls.length, 1);
  assert.match(items[0].json.error, /HTTP 429/);
  assert.doesNotMatch(items[0].json.error, /supplier|secret/);
});

test('credential masks its token and tests a query-only route', () => {
  const credential = new AceDataQwenImageApi();
  assert.equal(credential.properties[0].typeOptions.password, true);
  assert.match(credential.authenticate.properties.headers.Authorization, /Bearer/);
  assert.equal(credential.test.request.url, '/qwen-image/tasks');
  assert.deepEqual(credential.test.request.body, {
    action: 'retrieve', id: '00000000-0000-0000-0000-000000000000',
  });
});

test('body helper uses the documented size syntax and model list', () => {
  const body = imageBody(name => generate[name], 'generate');
  assert.equal(body.size, '1024*1024');
  assert.equal(body.model, 'qwen-image-3.0');
});
