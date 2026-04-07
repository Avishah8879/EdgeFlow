import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

interface CodeExamplesProps {
  apiKey?: string;
}

export function CodeExamples({ apiKey }: CodeExamplesProps) {
  const placeholder = apiKey || "YOUR_API_KEY";

  const examples = {
    curl: `curl -H "X-API-Key: ${placeholder}" \\
  https://your-domain.com/v1/api/stocks?limit=5`,
    python: `import requests

headers = {"X-API-Key": "${placeholder}"}

# Fetch stocks
response = requests.get(
    "https://your-domain.com/v1/api/stocks",
    headers=headers,
    params={"limit": 5}
)
data = response.json()
print(data["data"])  # List of stocks
print(data["meta"])  # Pagination info`,
    javascript: `const API_KEY = "${placeholder}";

const response = await fetch(
  "https://your-domain.com/v1/api/stocks?limit=5",
  { headers: { "X-API-Key": API_KEY } }
);
const { data, meta } = await response.json();
console.log(data);  // List of stocks
console.log(meta);  // Pagination info`,
    sse: `// SSE streams (e.g. screener) — pass key as query param
const url = "https://your-domain.com/v1/api/expert-screener/stream/JOB_ID"
  + "?api_key=${placeholder}";
const source = new EventSource(url);

source.addEventListener("result", (e) => {
  const match = JSON.parse(e.data);
  console.log("Match:", match);
});
source.addEventListener("complete", () => source.close());`,
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Code Examples</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="curl">
          <TabsList>
            <TabsTrigger value="curl">cURL</TabsTrigger>
            <TabsTrigger value="python">Python</TabsTrigger>
            <TabsTrigger value="javascript">JavaScript</TabsTrigger>
            <TabsTrigger value="sse">SSE</TabsTrigger>
          </TabsList>
          {Object.entries(examples).map(([lang, code]) => (
            <TabsContent key={lang} value={lang}>
              <CodeBlock code={code} />
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative">
      <pre className="bg-muted rounded-md p-4 text-sm overflow-x-auto font-mono whitespace-pre-wrap break-all">
        {code}
      </pre>
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 h-8 w-8"
        onClick={copy}
      >
        {copied ? (
          <Check className="h-4 w-4 text-positive" />
        ) : (
          <Copy className="h-4 w-4" />
        )}
      </Button>
    </div>
  );
}
