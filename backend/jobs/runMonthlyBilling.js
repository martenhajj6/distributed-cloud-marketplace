// Run: node backend/jobs/runMonthlyBilling.js --dry-run
// Run: node backend/jobs/runMonthlyBilling.js --apply
require("dotenv").config({ path: require("path").join(__dirname, "../../.env") });
const db = require("../DAL/dbconn");
const { runMonthlyBilling } = require("../BLL/finance/monthlyBillingService");
(async () => {
    if (!process.argv.includes("--dry-run") && !process.argv.includes("--apply"))
        throw new Error("Specify --dry-run or --apply to avoid unintentional invoices.");
    const summary = await runMonthlyBilling({ dryRun: !process.argv.includes("--apply") });
    console.log(JSON.stringify(summary, null, 2));
    if (summary.results.some(row => row.status === "error")) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; })
  .finally(() => db.end());
