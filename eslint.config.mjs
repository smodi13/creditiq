import vitals from "eslint-config-next/core-web-vitals";
import ts from "eslint-config-next/typescript";
export default [...vitals, ...ts, { ignores: [".next/**", "node_modules/**"] }];
