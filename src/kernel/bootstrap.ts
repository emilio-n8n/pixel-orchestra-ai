import { getKernel } from "./index";
import { builtinPlugins } from "@/plugins";

let started = false;

export async function bootstrapKernel() {
  if (started) return;
  started = true;
  const { host } = getKernel();
  for (const p of builtinPlugins) {
    await host.register(p);
  }
}