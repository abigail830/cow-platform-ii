import { useEffect, useState, type FormEvent } from 'react';
import { Check, Loader2, Sparkles, X } from 'lucide-react';
import {
  createKbFaq,
  polishKbFaqAnswer,
  updateKbFaq,
  type KbFaq,
} from '../api/knowledgeBases.ts';
import { iconProps } from './icons/icon-props.ts';

type KbFaqAddEditModalProps = {
  knowledgeBaseId: string;
  faq?: KbFaq | null;
  onCancel: () => void;
  onSaved: () => void;
};

export function KbFaqAddEditModal({
  knowledgeBaseId,
  faq,
  onCancel,
  onSaved,
}: KbFaqAddEditModalProps) {
  const isEdit = Boolean(faq);
  const [question, setQuestion] = useState(faq?.question ?? '');
  const [answer, setAnswer] = useState(faq?.answer ?? '');
  const [polishedDraft, setPolishedDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [polishing, setPolishing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setQuestion(faq?.question ?? '');
    setAnswer(faq?.answer ?? '');
    setPolishedDraft(null);
    setError('');
  }, [faq]);

  async function handlePolish() {
    if (!question.trim() || !answer.trim()) {
      setError('Enter a question and answer before polishing.');
      return;
    }
    setPolishing(true);
    setError('');
    try {
      const result = await polishKbFaqAnswer(knowledgeBaseId, {
        faq_id: faq?.id,
        question: question.trim(),
        answer: answer.trim(),
      });
      setPolishedDraft(result.answer);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'TimeoutError') {
        setError('Polish timed out. Check the model configuration in FAQ settings or Builtin Agents.');
      } else {
        setError(err instanceof Error ? err.message : 'Failed to polish answer');
      }
    } finally {
      setPolishing(false);
    }
  }

  function handleAcceptPolish() {
    if (!polishedDraft) return;
    setAnswer(polishedDraft);
    setPolishedDraft(null);
  }

  function handleDiscardPolish() {
    setPolishedDraft(null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!question.trim() || !answer.trim()) return;
    setSaving(true);
    setError('');
    try {
      if (isEdit && faq) {
        await updateKbFaq(knowledgeBaseId, faq.id, {
          question: question.trim(),
          answer: answer.trim(),
        });
      } else {
        await createKbFaq(knowledgeBaseId, {
          question: question.trim(),
          answer: answer.trim(),
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save FAQ');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="modal-card model-config-form kb-faq-form-modal"
        role="dialog"
        aria-labelledby="kb-faq-form-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="kb-faq-form-title">{isEdit ? 'Edit FAQ' : 'Add FAQ'}</h2>
        {error && <p className="admin-error" role="alert">{error}</p>}
        <form className="form-grid" onSubmit={(e) => void handleSubmit(e)}>
          <label className="form-field form-field-wide">
            <span>Question</span>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={3}
              required
              autoFocus
            />
          </label>
          <label className="form-field form-field-wide">
            <span>Answer</span>
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              rows={8}
              required
            />
          </label>
          <div className="form-field form-field-wide kb-faq-polish-row">
            <button
              type="button"
              className="btn-secondary"
              disabled={polishing || !question.trim() || !answer.trim()}
              onClick={() => void handlePolish()}
            >
              {polishing ? (
                <Loader2 {...iconProps({ size: 16, className: 'icon-btn-spin' })} aria-hidden />
              ) : (
                <Sparkles {...iconProps({ size: 16 })} aria-hidden />
              )}
              AI Polish Answer
            </button>
            <span className="admin-form-hint">
              Uses the polish model configured in FAQ settings.
            </span>
          </div>

          {polishedDraft ? (
            <section className="form-field form-field-wide kb-faq-polish-suggestion" aria-label="Polished suggestion">
              <div className="kb-faq-polish-suggestion-header">
                <span className="kb-faq-polish-suggestion-title">Polished suggestion</span>
                <span className="admin-muted">Review before applying to Answer</span>
              </div>
              <div className="kb-faq-polish-suggestion-output">{polishedDraft}</div>
              <div className="kb-faq-polish-suggestion-actions">
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleAcceptPolish}
                >
                  <Check {...iconProps({ size: 16 })} aria-hidden />
                  Accept
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleDiscardPolish}
                >
                  <X {...iconProps({ size: 16 })} aria-hidden />
                  Discard
                </button>
              </div>
            </section>
          ) : null}

          <div className="modal-actions form-field-wide">
            <button type="button" className="btn-secondary" onClick={onCancel}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={saving || !question.trim() || !answer.trim()}
            >
              {saving ? 'Saving…' : isEdit ? 'Save' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
