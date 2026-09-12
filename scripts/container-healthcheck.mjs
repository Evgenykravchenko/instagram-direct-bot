const port = process.env.HTTP_PORT ?? '8091';
const response = await fetch(`http://127.0.0.1:${port}/health`, {
  signal: AbortSignal.timeout(4000),
});
if (!response.ok) process.exit(1);
