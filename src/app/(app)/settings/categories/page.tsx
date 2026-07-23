import type { Metadata } from "next";

import { CategoryManager } from "@/components/settings/CategoryManager";
import { QuickLinksEditor } from "@/components/settings/QuickLinksEditor";

export const metadata: Metadata = { title: "Categories" };

export default function CategoriesPage() {
  return (
    <div className="space-y-4">
      <QuickLinksEditor />
      <CategoryManager />
    </div>
  );
}
