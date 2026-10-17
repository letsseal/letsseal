import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CenteredPage } from "@/components/common/centered-page";

export default function NotFound() {
  return (
    <CenteredPage title="Page not found" description="The link may be broken, or the page may have moved.">
      <div className="flex justify-center">
        <Button asChild variant="outline"><Link href="/">Go home</Link></Button>
      </div>
    </CenteredPage>
  );
}
