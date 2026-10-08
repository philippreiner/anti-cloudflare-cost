import { defineRule } from "@oxlint/plugins";

export const noUnmanagedInterval = defineRule({
  meta: {
    type: "problem",
    docs: { description: "Require review of browser interval timers." },
    schema: [],
    messages: {
      review:
        "Review browser polling: pause when hidden, serialize requests, set a deadline, and stop at a terminal outcome. A local-only clock may use a reasoned suppression.",
    },
  },
  createOnce(context) {
    return {
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type === "Identifier" && callee.name === "setInterval") {
          context.report({ node, messageId: "review" });
          return;
        }
        if (
          callee.type !== "MemberExpression" ||
          callee.object.type !== "Identifier"
        )
          return;
        if (!["window", "globalThis", "self"].includes(callee.object.name))
          return;
        const method = callee.computed
          ? callee.property.type === "Literal"
            ? callee.property.value
            : undefined
          : callee.property.type === "Identifier"
            ? callee.property.name
            : undefined;
        if (method === "setInterval")
          context.report({ node, messageId: "review" });
      },
    };
  },
});
