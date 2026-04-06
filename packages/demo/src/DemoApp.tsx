import { type BroadsetDocument, broadsetDocumentSchema } from '@broadset/model';
import { createScreenRenderer, type ScreenRendererController } from '@broadset/renderer';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Chip, Separator } from '@heroui/react';
import { useEffect, useRef } from 'react';

import { SAMPLE_DOCUMENT, SAMPLE_PROJECT } from './sampleDocument';

const DEMO_DOCUMENT = broadsetDocumentSchema.parse(SAMPLE_DOCUMENT);

interface ScreenPreviewProps {
  readonly documentData: BroadsetDocument;
}

function ScreenPreview({ documentData }: ScreenPreviewProps): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<ScreenRendererController | null>(null);

  useEffect(() => {
    const host = hostRef.current;

    if (host === null) {
      return undefined;
    }

    const controller = createScreenRenderer({ host });

    controllerRef.current = controller;

    return () => {
      controller.destroy();
      controllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    controllerRef.current?.updateDocument(documentData);
  }, [documentData]);

  return (
    <div
      ref={hostRef}
      aria-label={`Screen preview for ${documentData.name}`}
      className="h-full w-full overflow-hidden rounded-2xl bg-default-100/10"
      data-testid="screen-renderer-host"
    />
  );
}

export function DemoApp(): React.JSX.Element {
  const documentData = DEMO_DOCUMENT;
  const projectDocuments = SAMPLE_PROJECT.documents.length;
  const totalElements = SAMPLE_PROJECT.documents.reduce((count, item) => count + item.elements.length, 0);

  useEffect(() => {
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    const previousBodyMargin = document.body.style.margin;

    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    document.body.style.margin = '0';

    return () => {
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.margin = previousBodyMargin;
    };
  }, []);

  return (
    <main className="fixed inset-0 overflow-hidden bg-background text-foreground" data-testid="demo-shell">
      <div className="relative flex h-full w-full flex-col overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-wrap items-start justify-between gap-4 p-4">
          <Card className="pointer-events-auto max-w-xl bg-content1/80 backdrop-blur-md" variant="secondary">
            <CardHeader className="flex flex-col items-start gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Chip color="accent" size="sm" variant="soft">
                  Broadset Demo
                </Chip>
                <Chip color="success" size="sm" variant="soft">
                  Phase 2
                </Chip>
              </div>
              <div>
                <CardTitle>{documentData.name}</CardTitle>
                <CardDescription>
                  Static renderer preview of the hard-coded sample package, mounted inside a full-viewport shell.
                </CardDescription>
              </div>
            </CardHeader>
          </Card>

          <Card className="pointer-events-auto bg-content1/80 backdrop-blur-md" variant="secondary">
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                <Chip color="success" size="sm" variant="soft">
                  {projectDocuments} documents
                </Chip>
                <Chip color="default" size="sm" variant="soft">
                  {documentData.pages.length} pages
                </Chip>
                <Chip color="warning" size="sm" variant="soft">
                  {totalElements} elements
                </Chip>
              </div>
              <Separator />
              <p className="text-sm text-default-500">
                Canvas: {documentData.canvas.width}×{documentData.canvas.height}
                {documentData.canvas.unit}
              </p>
            </CardContent>
          </Card>
        </div>

        <section className="flex min-h-0 flex-1 overflow-hidden p-4 pt-28">
          <Card className="h-full w-full bg-content1/10 backdrop-blur-sm" variant="secondary">
            <CardContent className="h-full p-3">
              <ScreenPreview documentData={documentData} />
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
