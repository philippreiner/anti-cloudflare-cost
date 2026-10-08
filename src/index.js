import { eslintCompatPlugin } from "@oxlint/plugins";
import { requireAlarmReview } from "./rules/require-alarm-review.js";
import { noUnmanagedInterval } from "./rules/no-unmanaged-interval.js";

export default eslintCompatPlugin({
  meta: { name: "anti-cloudflare-cost" },
  rules: {
    "require-alarm-review": requireAlarmReview,
    "no-unmanaged-interval": noUnmanagedInterval,
  },
});
