// Prints the URL where Loco is actually reachable, so the terminal shows a
// clickable link instead of a useless localhost address when running inside
// GitHub Codespaces (whose public URL lives on app.github.dev, not localhost).
const port = process.env.PORT || "3000";
const codespace = process.env.CODESPACE_NAME;
const domain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;

const line = "═".repeat(64);
if (codespace && domain) {
  const url = `https://${codespace}-${port}.${domain}`;
  console.log(`\n${line}`);
  console.log("  Open Loco at:");
  console.log(`  ${url}`);
  console.log("");
  console.log("  To share this link, set port " + port + " to Public in the");
  console.log("  Ports tab. Note: a Codespace link stops working when the");
  console.log("  Codespace sleeps — for a permanent link, see the README's");
  console.log('  "Get your permanent link" section (Deploy with Vercel).');
  console.log(`${line}\n`);
} else {
  console.log(`\n${line}`);
  console.log(`  Open Loco at:  http://localhost:${port}`);
  console.log(`${line}\n`);
}
