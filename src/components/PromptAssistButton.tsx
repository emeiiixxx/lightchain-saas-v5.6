import type { ReactNode } from 'react';
import GradientText from './GradientText';
import { Button } from './ui';
import './PromptAssistButton.css';

export type PromptAssistAction = 'generate' | 'expand';
type Props = {
  value: string;
  icon: ReactNode;
  generateLabel?: string;
  expandLabel?: string;
  onAction: (action: PromptAssistAction) => void;
};
const colors = ['currentColor', 'var(--prompt-assist-highlight)'];

// Shared by the inline node and expanded prompt editor. AI requests belong to
// the caller; this component only selects the action and renders its effect.
export function PromptAssistButton({ value, icon, generateLabel = '提示词生成', expandLabel = '提示词扩写', onAction }: Props) {
  const action: PromptAssistAction = value.trim() ? 'expand' : 'generate';
  const label = action === 'generate' ? generateLabel : expandLabel;
  return <Button className="video-prompt-expand prompt-assist-button" onClick={() => onAction(action)}>
    <GradientText colors={colors} animationSpeed={2} pauseDuration={1} variant="shimmer" angle={90} yoyo={false} glow={0}>
      {icon}<span>{label}</span>
    </GradientText>
  </Button>;
}
