import { Card, CardContent, CardDescription, CardHeader, CardTitle, Chip, Separator } from '@heroui/react';
import ReactDOM from 'react-dom/client';

import { SAMPLE_PROJECT } from './sampleDocument';

const rootElement = document.getElementById('root');

if (rootElement === null) {
  throw new Error('Demo root element #root was not found');
}

function DemoApp(): React.JSX.Element {
  const documents = SAMPLE_PROJECT.documents;
  const totalElements = documents.reduce((count, document) => count + document.elements.length, 0);
  const totalAnimations = documents.reduce((count, document) => count + document.animations.length, 0);

  return (
    <main className="min-h-screen bg-background px-6 py-8 text-foreground">
      <Card className="mx-auto max-w-5xl" variant="secondary">
        <CardHeader className="flex flex-col items-start gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Chip color="accent" variant="soft">
              Broadset Demo
            </Chip>
            <Chip color="success" variant="soft">
              {SAMPLE_PROJECT.documents.length} documents
            </Chip>
            <Chip color="default" variant="soft">
              {totalElements} elements
            </Chip>
            <Chip color="warning" variant="soft">
              {totalAnimations} animations
            </Chip>
          </div>
          <div>
            <CardTitle>{SAMPLE_PROJECT.name}</CardTitle>
            <CardDescription>
              Reference host shell for the current Broadset project model and sample broadcast package.
            </CardDescription>
          </div>
        </CardHeader>
        <Separator />
        <CardContent className="flex flex-col gap-4">
          {documents.map((document) => (
            <Card key={document.id} variant="default">
              <CardHeader className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle>{document.name}</CardTitle>
                  <CardDescription>
                    {document.documentMode} · {document.canvas.width}×{document.canvas.height}
                    {document.canvas.unit}
                  </CardDescription>
                </div>
                <Chip color="default" variant="secondary">
                  {document.pages.length} pages
                </Chip>
              </CardHeader>
              <Separator />
              <CardContent className="grid gap-2 sm:grid-cols-3">
                <Chip color="default" variant="soft">
                  {document.elements.length} elements
                </Chip>
                <Chip color="accent" variant="soft">
                  {document.animations.length} animations
                </Chip>
                <Chip color="success" variant="soft">
                  {document.dataSchema.fields.length} data fields
                </Chip>
              </CardContent>
            </Card>
          ))}
        </CardContent>
      </Card>
    </main>
  );
}

ReactDOM.createRoot(rootElement).render(<DemoApp />);
