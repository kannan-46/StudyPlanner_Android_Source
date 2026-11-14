import React, { useContext, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { NavigationContext } from '@react-navigation/native';
import type { TopicView } from '@planner/shared';
import { formatDate } from '../../shared/lib/format';
import { clearOnboardingStep } from '../../shared/lib/localPrefs';
import { Button } from '../../shared/ui/Button';
import { Dialog } from '../../shared/ui/Dialog';
import { ErrorRetry } from '../../shared/ui/ErrorRetry';
import { useSnackbar } from '../../shared/ui/Snackbar';
import { useTheme } from '../../shared/ui/ThemeProvider';
import { useLeaveGuard } from '../../shared/ui/useLeaveGuard';
import { useAuth } from '../auth/AuthProvider';
import { useUpdateMe } from '../me/hooks';
import { useTopics } from '../topics/hooks';
import { TopicForm, type TopicFormHandle } from '../topics/TopicForm';
import { StepShell } from './StepShell';

export const FINISH_HINT = 'Add at least one topic, or tap Skip for now';

/** Asks "Discard changes?" before Back throws away a half-typed topic. */
function LeaveGuard({ dirty }: { dirty: boolean }) {
  return useLeaveGuard(dirty).dialog;
}

export function TopicsStep() {
  // Optional, so the step can also be shown on its own.
  const navigation = useContext(NavigationContext);
  const [dirty, setDirty] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const { colors, spacing } = useTheme();
  const { refreshUser } = useAuth();
  const snackbar = useSnackbar();
  const updateMe = useUpdateMe();
  const topicsQ = useTopics();
  const form = useRef<TopicFormHandle>(null);
  const [added, setAdded] = useState(0);
  // Topics that existed before this session (relaunch mid-setup).
  const baseline = useRef<number | null>(null);
  if (baseline.current === null && topicsQ.data) {
    baseline.current = topicsQ.data.length - added;
  }
  const total = (baseline.current ?? 0) + added;
  const [error, setError] = useState<unknown>(null);
  const [finishing, setFinishing] = useState(false);
  const [askDiscard, setAskDiscard] = useState(false);
  const busy = useRef(false);

  const onSaved = (t: TopicView) => {
    setAdded(n => n + 1);
    snackbar.show({
      message: `${t.name} added — first revision ${
        t.nextDueOn ? formatDate(t.nextDueOn) : 'scheduled'
      }`,
    });
  };

  /**
   * Finish saves a typed topic first (its errors show in the form, and setup
   * only completes once it saved). Skip leaves the typed topic out.
   */
  async function complete(saveDraft: boolean) {
    if (busy.current) return;
    busy.current = true;
    setError(null);
    setFinishing(true);
    try {
      if (saveDraft && form.current?.hasDraft()) {
        const saved = await form.current.submit();
        if (!saved) return;
      }
      await updateMe.mutateAsync({ onboardingCompleted: true });
      clearOnboardingStep();
      await refreshUser();
    } catch (e) {
      setError(e);
    } finally {
      busy.current = false;
      setFinishing(false);
    }
  }

  const finish = () => complete(true);
  const skip = () => {
    if (form.current?.hasDraft()) setAskDiscard(true);
    else complete(false);
  };

  return (
    <StepShell step={4} title="Add your first topics">
      <Text
        style={{
          color: colors.text,
          fontWeight: '600',
          marginBottom: spacing.md,
        }}
      >
        {`Added: ${total} ${total === 1 ? 'topic' : 'topics'}`}
      </Text>
      <TopicForm
        ref={form}
        mode="create"
        compact
        clearNameOnSave
        submitLabel="Save & add another"
        submitVariant="secondary"
        onSaved={onSaved}
        onDirtyChange={setDirty}
        onDraftChange={setHasDraft}
      />
      {navigation ? <LeaveGuard dirty={dirty} /> : null}
      {error ? <ErrorRetry error={error} onRetry={finish} /> : null}
      <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
        <Button
          title="Finish"
          onPress={finish}
          loading={finishing}
          disabled={(total < 1 && !hasDraft) || finishing}
          disabledHint={FINISH_HINT}
        />
        <Button
          title="Skip for now"
          variant="text"
          onPress={skip}
          disabled={finishing}
        />
      </View>
      <Dialog
        visible={askDiscard}
        title="Discard the topic you typed?"
        onRequestClose={() => setAskDiscard(false)}
        actions={
          <>
            <Button
              title="Save it and finish"
              onPress={() => {
                setAskDiscard(false);
                finish();
              }}
            />
            <Button
              title="Discard and skip"
              variant="danger"
              onPress={() => {
                setAskDiscard(false);
                complete(false);
              }}
            />
            <Button
              title="Keep editing"
              variant="text"
              onPress={() => setAskDiscard(false)}
            />
          </>
        }
      >
        <Text style={{ color: colors.text }}>
          You typed a topic but haven't saved it. Skipping now leaves it out.
        </Text>
      </Dialog>
    </StepShell>
  );
}
