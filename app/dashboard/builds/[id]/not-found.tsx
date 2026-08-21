import Link from "next/link";
import { Boxes } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function BuildNotFound() {
  return (
    <div className="mx-auto max-w-xl">
      <Card>
        <CardHeader className="items-center text-center">
          <Boxes className="size-8 text-muted-foreground" />
          <CardTitle className="mt-2 text-lg">Build not found</CardTitle>
          <CardDescription>
            This build doesn&apos;t exist, or it belongs to a different workspace session.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Button asChild>
            <Link href="/dashboard">Back to overview</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
