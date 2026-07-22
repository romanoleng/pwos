import type { Metadata } from "next";

import { CategoryManager } from "@/components/settings/CategoryManager";

export const metadata: Metadata = { title: "Categories" };

export default function CategoriesPage() {
  return <CategoryManager />;
}
