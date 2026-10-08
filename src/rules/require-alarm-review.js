import { defineRule } from "@oxlint/plugins";

export const requireAlarmReview = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Require review of alarm scheduling and recurring Agent work.",
    },
    schema: [],
    messages: {
      review:
        "Review recurring work: persist an attempt cap, expiry, or ongoing-work budget, and handle exhaustion. Backoff alone does not stop retries. Record the verified bound in a local suppression reason.",
    },
  },
  createOnce(context) {
    return {
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type !== "MemberExpression") return;
        const method = callee.computed
          ? callee.property.type === "Literal"
            ? callee.property.value
            : undefined
          : callee.property.type === "Identifier"
            ? callee.property.name
            : undefined;
        if (method === "setAlarm" || method === "scheduleEvery")
          context.report({ node, messageId: "review" });
      },
    };
  },
});
