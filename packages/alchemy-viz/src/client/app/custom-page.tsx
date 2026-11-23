import { Page } from "../../ui/index.ts";
import { NotFound } from "./not-found.tsx";
import { PageHost } from "./plugin-host.tsx";
import { pageRoute } from "./router.tsx";
import { useStack } from "./use-stack.ts";

export function CustomPage() {
  const { _splat: route } = pageRoute.useParams();
  const data = useStack().data!;
  const page = data.pages.find(p => p.route === route);
  if(!page) return <NotFound />;
  return (
    <Page title={page.title}>
      <PageHost pageId={page.id} stack={data.stack} />
    </Page>
  );
}
