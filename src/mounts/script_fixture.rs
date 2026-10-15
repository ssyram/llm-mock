pub fn command() -> String {
    "python3 -c 'import json,sys; i=json.load(sys.stdin); print(json.dumps({\"content\":[{\"type\":\"text\",\"text\":i[\"api\"]+\"|\"+i[\"keyId\"]+\"|\"+str(i[\"sessionSignal\"])}],\"api\":i[\"api\"],\"provider\":\"mock\",\"model\":i[\"model\"],\"usage\":{\"input\":0,\"output\":0,\"cacheRead\":0,\"cacheWrite\":0,\"totalTokens\":0,\"cost\":{\"input\":0,\"output\":0,\"cacheRead\":0,\"cacheWrite\":0,\"total\":0}},\"stopReason\":\"stop\",\"timestamp\":0}))'".into()
}
