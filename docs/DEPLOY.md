# Deploy runbook (Aneek only; all AWS steps)

Prereqs: AWS CLI v2, SAM CLI, Python 3.12 (with pip) on PATH, profile `thirstcast`, region from `docs/decisions.md`.
Everything below is run from the repo root unless noted. Replace `<...>` placeholders.

## 1. Build and deploy the stack
```bash
cd backend
sam validate --lint
sam build                    # builds CommonLayer + AgentLayer (strands-agents, ~76 MB unzipped)
sam deploy --guided --profile thirstcast
#   Stack name: thirstcast      Region: <region>
#   ModelId: <Bedrock model / inference-profile ID, or empty for template-only>
#   AskMode: llm                AmplifyOrigin: (empty for now)
#   AlertEmail1..4: team emails (optional; each person must click "Confirm subscription")
#   Confirm changes: y   Allow SAM CLI IAM role creation: y
#   "ApiFunction/AgentFunction has no authentication. Is this okay?": y (public advisory API)
#   Save arguments to samconfig.toml: y   -> commit backend/samconfig.toml (no secrets in it)
cd ..
```
Read the outputs (or `aws cloudformation describe-stacks --stack-name thirstcast --profile thirstcast --query "Stacks[0].Outputs"`):
```bash
out() { aws cloudformation describe-stacks --stack-name thirstcast --profile thirstcast \
        --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }
export API=$(out ApiUrl) BUCKET=$(out BucketName) CLIM=$(out ClimatologyTableName) \
       CONF=$(out ConfigTableName) DET=$(out DetectorFunctionName)
echo $API $BUCKET $CLIM $CONF $DET
```

## 2. Load data (AN-08, AN-11)
```bash
pip install boto3
python backend/scripts/load_dynamo.py --table $CLIM --file data/out/climatology.json --profile thirstcast   # 1095
python backend/scripts/load_dynamo.py --table $CONF --file data/out/config_items.json --profile thirstcast  # 10
aws dynamodb scan --table-name $CLIM --select COUNT --profile thirstcast     # expect "Count": 1095
BUCKET=$BUCKET bash backend/scripts/upload_s3.sh                            # raw/, replay/, geo/
```
If you previously loaded the 3 test items from A2, overwrite is fine (same keys).

## 3. First detector run + API check (AN-09, AN-12)
```bash
aws lambda invoke --function-name $DET --payload '{}' --cli-binary-format raw-in-base64-out \
    --profile thirstcast /tmp/det.json && cat /tmp/det.json
curl -s $API/districts
curl -s $API/thirstwave/Mandya
curl -s $API/replay/Bengaluru_Urban | head -c 400
curl -s -o /dev/null -w "%{http_code}\n" $API/thirstwave/Atlantis     # 404
curl -s -X POST $API/ask -H 'content-type: application/json' -d '{"question":"Will Mandya face a thirstwave this week?"}'
curl -s -X POST $API/ask -H 'content-type: application/json' -d '{"question":"क्या इस हफ्ते मंड्या में थर्स्टवेव आएगी?"}'
curl -s -o /dev/null -w "%{http_code}\n" -X POST $API/ask -d '{}'      # 400
```
The EventBridge rule (`cron(30 0 * * ? *)` = 06:00 IST) is created by the template; check it in
EventBridge → Rules and the next morning in CloudWatch Logs `/aws/lambda/<DetectorFunction>`.

## 4. Bedrock / agent (AN-04, AN-14)
* Put the model ID in `docs/decisions.md`. Re-run `sam deploy --guided` (it remembers the other answers) and set
  `ModelId`; `MODEL_PROVIDER` becomes `bedrock` automatically when `ModelId` is not empty.
* Kill switch: re-deploy with `AskMode=template` (or set env `ASK_MODE=template` on the AgentFunction in the console).
* If the model needs a cross-region inference profile, use its ID (e.g. one starting with `apac.`); the IAM policy
  already allows foundation models and inference profiles in any region of this account.
* Test with the two `/ask` curls above (`"mode":"llm"` and `tools_used` non-empty), then run the eval in batch:
  `python agent/tests/run_eval.py --url $API/ask` (23 questions, about 1 per second).

## 5. Amplify (AN-10)
1. Merge the frontend PR to `main`.
2. Amplify console → Create new app → GitHub → `aneek22112007-tech/thirstcast`, branch `main`.
3. Tick "My app is a monorepo", app root `frontend`. Amplify picks up `amplify.yml` from the repo root
   (no build commands, artifacts = `frontend/`). Turn PR previews off.
4. After the first deploy, copy the domain (e.g. `https://main.d123abc.amplifyapp.com`) and re-run
   `cd backend && sam deploy --guided` with `AmplifyOrigin` = that domain (CORS + the link in alert emails).
5. In `frontend/config.js` set `API_BASE_URL: "<ApiUrl without trailing slash>"`, `USE_MOCK: false`; PR → merge →
   Amplify redeploys. Check: no "MOCK DATA" badge, three coloured districts, replay, chat.

## 6. SNS alerts (AN-17)
Everyone confirms the subscription email. Then send the honest replay alert:
```bash
aws lambda invoke --function-name $DET --payload '{"mode":"replay","district":"Bengaluru_Urban"}' \
    --cli-binary-format raw-in-base64-out --profile thirstcast /tmp/replay.json && cat /tmp/replay.json
```
Subject starts with `[REPLAY April 2024]`. Live alerts go out only when a district changes to ACTIVE.

## 7. Outage test (AN-15)
In the console set env `OPEN_METEO_FORECAST_URL=https://invalid.example` and `OPEN_METEO_ARCHIVE_URL=https://invalid.example`
on the DetectorFunction, invoke it: each district should return `"stale": true` (uses `cache/forecast/...` from S3).
Remove the two variables afterwards (or redeploy).

## 8. Tear-down after judging (AN-22)
```bash
aws s3 rm s3://$BUCKET --recursive --profile thirstcast
cd backend && sam delete --stack-name thirstcast --profile thirstcast
```
Then delete the Amplify app and check Billing.
