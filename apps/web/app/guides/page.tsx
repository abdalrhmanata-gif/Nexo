import { GuidesIndex, guidesIndexMetadata } from "../../components/guide-article";

export const metadata = guidesIndexMetadata("en");

export default function GuidesPage() {
  return <GuidesIndex lang="en" />;
}
