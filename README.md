# Qwen Image for n8n: first image

Generate one Qwen Image picture and retrieve its completed result in an n8n workflow through AceDataCloud. This package integrates only the Qwen Image service and is maintained by Ace Data Cloud.

**Package:** @acedatacloud/n8n-nodes-qwen-image · [Current models and pricing](https://platform.acedata.cloud/models) · [Source](https://github.com/AceDataCloud/QwenImageN8N)

## 1. Install the node

On self-hosted n8n, sign in as an owner or admin. Open **Settings → Community nodes → Install**, enter **@acedatacloud/n8n-nodes-qwen-image**, review the author **Ace Data Cloud**, accept n8n's installation notice, and select **Install**. Your n8n server needs HTTPS access to npm and api.acedata.cloud.

n8n Cloud offers a community node in the node picker only after n8n verifies it. Check the picker for the current status; an npm release alone does not prove Cloud availability. See [n8n's self-hosted installation guide](https://docs.n8n.io/integrations/community-nodes/installation-and-management/gui-installation/).

![Qwen Image visible in a local n8n 2.42.3 node picker](https://raw.githubusercontent.com/AceDataCloud/QwenImageN8N/main/_assets/tutorial/01-node-picker.png)

## 2. Get an API key with Qwen Image access

1. Sign in at [Ace Data Cloud → Applications](https://platform.acedata.cloud/console/applications).
2. Open **General application**. Copy its API key or choose **Manage Keys → Create** for a separate n8n key.
3. Check Qwen Image access, current pricing, and balance. If **Allowed APIs** is enabled, include both /qwen-image/images and /qwen-image/tasks.

![Copy a key or open Manage Keys](https://raw.githubusercontent.com/AceDataCloud/QwenImageDify/451358bb459ab3e601d729e07438d145d5915da1/_assets/tutorial/get-api-key-en.png)

![Create a separate key](https://raw.githubusercontent.com/AceDataCloud/QwenImageDify/451358bb459ab3e601d729e07438d145d5915da1/_assets/tutorial/create-api-key-en.png)

Copy only the application API token. Do not include **Bearer**, quotes, or a platform management token, and never put the token into a prompt or exported workflow.

## 3. Save the credential in n8n

Add **Qwen Image by AceDataCloud** to a workflow. In **Credential**, select **Connect to Qwen Image by AceDataCloud** and create a new credential. Paste the token into **API Token**. Set **Allowed HTTP Request Domains** to **Specific Domains** and enter api.acedata.cloud, then save. Select the same credential on both **Create** and **Get Task**.

The credential test queries a nonexistent task ID. It does not generate an image or verify generation access. The first actual generation confirms service entitlement.

![Saved n8n credential with masked token and a restricted API domain](https://raw.githubusercontent.com/AceDataCloud/QwenImageN8N/main/_assets/tutorial/02-credential.png)

## 4. Import and run the first workflow

[Download the credential-free quickstart](https://github.com/AceDataCloud/QwenImageN8N/raw/refs/heads/main/examples/quickstart.json). In a new n8n workflow, choose **⋯ → Import → From file**, select that JSON file, and assign your credential to both Qwen Image nodes. The path is **Start → Create → Wait 30 Seconds → Get Task**.

![Imported Qwen Image workflow in n8n 2.42.3](https://raw.githubusercontent.com/AceDataCloud/QwenImageN8N/main/_assets/tutorial/03-workflow.png)

The **Create** node uses one confirmed, low-cost first-run setting:

| Field | Value |
| --- | --- |
| Resource / Operation | Image / Generate |
| Model | qwen-image-3.0 |
| Size | 1024*1024 |
| Output count | 1, fixed by the node |

Prompt:

~~~text
A single blue paper sphere on a cream background, studio product photograph, no text. n8n validation.
~~~

Use a literal asterisk in the size. Keep **Retry On Fail** off on **Create** and select **Execute workflow** once. Create returns a task ID with status **submitted**; this is an acknowledgment, not a finished image. The **Get Task** field is an expression pointing to **Create → taskId**, so the workflow queries that same ID after waiting.

![Qwen Image generation parameters and selected credential](https://raw.githubusercontent.com/AceDataCloud/QwenImageN8N/main/_assets/tutorial/04-configure.png)

![One real Create execution returning a task ID](https://raw.githubusercontent.com/AceDataCloud/QwenImageN8N/main/_assets/tutorial/05-task-id.png)

## 5. Confirm completion and the charge

Open **Get Task** output. Continue only when **status=succeeded**, **finished=true**, and **successful=true**. Open the URL in **imageUrls**. Check the matching request in [Ace Data Cloud usage history](https://platform.acedata.cloud/console): the task's **cost.amount** is in **Credits**, not USD, and the current account package rate determines any USD conversion.

One actual n8n 2.42.3 validation run submitted task **ea18ba09-dd10-43bd-a4b8-d3de3b32a575** once, then queried only that ID to success. Its 1024×1024 PNG opened successfully. The task reported **0.2838339222614841 Credits**; one HTTP 200 usage record with the same test credential and trace ID **94aebb17-4e57-4902-96b3-dc585e1889b2** deducted the same amount. Your price may differ by model, image size, account, and current pricing.

![Completed n8n query execution](https://raw.githubusercontent.com/AceDataCloud/QwenImageN8N/main/_assets/tutorial/06-execution.png)

![Actual terminal result, output image URL, and Credits](https://raw.githubusercontent.com/AceDataCloud/QwenImageN8N/main/_assets/tutorial/07-result.png)

![Actual generated Qwen Image picture](https://raw.githubusercontent.com/AceDataCloud/QwenImageN8N/main/_assets/tutorial/10-first-image.png)

If Get Task still says **processing** after 30 seconds, **do not rerun the whole workflow**: that would submit a second paid image. Copy the original task ID, import the [query-only workflow](https://github.com/AceDataCloud/QwenImageN8N/raw/refs/heads/main/examples/query-existing-task.json), replace its placeholder ID, assign the same credential, and run only that workflow until the task reaches a terminal state. The [bounded polling example](https://github.com/AceDataCloud/QwenImageN8N/raw/refs/heads/main/examples/generate-and-wait.json) queries the same ID for up to 30 minutes without resubmitting Create. Reaching its deadline does not cancel a submitted task.

## Troubleshooting

| What you see | What to check |
| --- | --- |
| 401 or 403 | Copy the application API token without **Bearer**; check expiration, Qwen Image access, balance, and Allowed APIs for both image and task endpoints. |
| 400 | Use qwen-image-3.0 and literal **1024*1024** for the first run. Editing requires one to three publicly accessible HTTPS image URLs. |
| submitted or processing | Query the **same** task ID. Do not run Create again to poll. |
| 429 | Reduce concurrency; leave automatic paid retries off. |
| Timeout or 5xx | Inspect the original task and usage history before resubmitting, because the first request may have been accepted. |
| Image link fails | Confirm the task is terminal and the returned URL opens in a browser. |

## More capabilities

**Image → Edit** uses the same Qwen Image endpoint with one to three public HTTPS reference URLs, separated by commas or new lines. Each input image can affect the current price. Start from the [credential-free Edit workflow](https://github.com/AceDataCloud/QwenImageN8N/raw/refs/heads/main/examples/edit-and-query.json), which uses the public blue sphere from this guide; you can replace that URL with your own image. Assign the credential to both nodes and execute it once. **Task → Get Many** retrieves up to 50 specified IDs without generating images.

For a separate edit validation, the workflow used the generated blue sphere as its reference and asked Qwen Image to change it to coral. Task **d2ebff6a-91d2-4a85-a5c6-b812cc670694** reached success after same-ID queries. Its 1024×1024 PNG opened; **0.31221731448763246 Credits** matched one HTTP 200 usage record with trace ID **3cfead11-4577-4b12-a604-bf970ae984fa**. A Get Many query then retrieved both successful task IDs without creating another image.

![Edit parameters with the reference image URL](https://raw.githubusercontent.com/AceDataCloud/QwenImageN8N/main/_assets/tutorial/08-edit-config.png)

![Completed Edit task, image URL, and Credits](https://raw.githubusercontent.com/AceDataCloud/QwenImageN8N/main/_assets/tutorial/09-edit-result.png)

![Actual edited Qwen Image picture](https://raw.githubusercontent.com/AceDataCloud/QwenImageN8N/main/_assets/tutorial/11-edited-image.png)

The node fixes output count at one image per paid request, sends no automatic create retry, never substitutes a model, and does not follow HTTP redirects. Each incoming n8n item can create one paid task. Agent tool use is available, but each creation tool call may be charged separately. Task query output omits private user, credential, request, and supplier fields.

[Privacy](https://github.com/AceDataCloud/QwenImageN8N/blob/main/PRIVACY.md) · [Report an issue](https://github.com/AceDataCloud/QwenImageN8N/issues) · dev@acedata.cloud
