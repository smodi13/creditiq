import { notFound } from "next/navigation";
import { analyze } from "./analysis";
import { getCompany } from "@/data/companies";

export async function load(params: Promise<{ id: string }>) {
  const { id } = await params;
  const c = getCompany(id);
  if (!c) notFound();
  return { c, a: analyze(c) };
}
