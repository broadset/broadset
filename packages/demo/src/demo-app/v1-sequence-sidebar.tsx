import { type ProjectEditorStore, selectActiveDocumentV1 } from '@broadset/editor';
import { projectFormatV1 } from '@broadset/model';
import { Input, ListBox, Select } from '@heroui/react';

import { useEditorSelector } from './helpers';

interface V1SequenceSidebarProps {
  readonly editorStore: ProjectEditorStore;
}

function updateSequence(
  document: projectFormatV1.BroadsetDocumentV1,
  sequenceId: projectFormatV1.Id,
  updater: (sequence: projectFormatV1.Sequence) => projectFormatV1.Sequence,
): projectFormatV1.BroadsetDocumentV1 {
  return {
    ...document,
    sequences: document.sequences.map((sequence) => (sequence.id === sequenceId ? updater(sequence) : sequence)),
  };
}

export function V1SequenceSidebar({ editorStore }: V1SequenceSidebarProps): React.JSX.Element {
  const state = useEditorSelector(editorStore, (current) => current);
  const document = selectActiveDocumentV1(state);
  const selectedSequence =
    document?.sequences.find(({ id }) => id === state.playbackSequenceId) ?? document?.sequences[0];

  if (document === undefined || selectedSequence === undefined) {
    return <div style={{ padding: 12 }}>This document has no animation sequences.</div>;
  }

  const updateSelected = (updater: (sequence: projectFormatV1.Sequence) => projectFormatV1.Sequence): void => {
    state.updateActiveDocument((current) => updateSequence(current, selectedSequence.id, updater));
  };

  return (
    <aside aria-label="Sequence editor" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 12 }}>
      <Select
        aria-label="Sequence"
        value={selectedSequence.id}
        onChange={(key) => {
          if (key === null) return;

          const sequenceId = projectFormatV1.idSchema.safeParse(String(key));

          if (!sequenceId.success) return;

          state.setPlaybackSequence(sequenceId.data);
          state.updateActiveDocument((current) => ({
            ...current,
            pages: current.pages.map((page) =>
              page.id === state.activePageId ? { ...page, sequenceId: sequenceId.data } : page,
            ),
          }));
        }}
      >
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            {document.sequences.map((sequence) => (
              <ListBox.Item id={sequence.id} key={sequence.id} textValue={sequence.name}>
                {sequence.name}
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>
      <Input
        aria-label="Sequence name"
        value={selectedSequence.name}
        onChange={(event) => {
          const name = event.currentTarget.value;

          updateSelected((sequence) => ({ ...sequence, name }));
        }}
      />
      <Input
        aria-label="Duration ticks"
        min={0}
        step={1}
        type="number"
        value={String(selectedSequence.durationTicks)}
        onChange={(event) => {
          const durationTicks = Number(event.currentTarget.value);

          if (!Number.isSafeInteger(durationTicks) || durationTicks < 0) return;

          updateSelected((sequence) => ({ ...sequence, durationTicks }));
        }}
      />
      <div>{`${String(selectedSequence.tracks.length)} tracks`}</div>
      {selectedSequence.tracks.map((track) => (
        <section key={track.id} aria-label={track.name}>
          <div>{track.name}</div>
          <div>{`${String(track.keyframes.length)} keyframes`}</div>
          {track.keyframes.map((keyframe, index) => (
            <Input
              key={keyframe.id}
              aria-label={`${track.name} keyframe ${String(index + 1)} tick`}
              min={0}
              step={1}
              type="number"
              value={String(keyframe.tick)}
              onChange={(event) => {
                const tick = Number(event.currentTarget.value);

                if (!Number.isSafeInteger(tick) || tick < 0) return;

                updateSelected((sequence) => ({
                  ...sequence,
                  tracks: sequence.tracks.map((candidate) =>
                    candidate.id === track.id ?
                      {
                        ...candidate,
                        keyframes: candidate.keyframes.map((candidateKeyframe) =>
                          candidateKeyframe.id === keyframe.id ? { ...candidateKeyframe, tick } : candidateKeyframe,
                        ),
                      }
                    : candidate,
                  ),
                }));
              }}
            />
          ))}
        </section>
      ))}
    </aside>
  );
}
