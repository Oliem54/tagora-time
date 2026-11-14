export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
    if (
      process.env.HORORA_DIRECTORY_CONSOLIDATED_PROOF === "1" &&
      process.env.VERCEL_ENV === "preview"
    ) {
      try {
        const { runConsolidatedDirectoryProof } = await import(
          "@/app/lib/auth/horora-directory-nexus.server"
        );
        const proof = await runConsolidatedDirectoryProof();
        console.log(`HORORA_DIRECTORY_PROOF ${JSON.stringify(proof)}`);
      } catch {
        console.log(
          'HORORA_DIRECTORY_PROOF {"signedRequestSent":false,"failureDependency":"PROOF_FAILED"}'
        );
      }
    }
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}
