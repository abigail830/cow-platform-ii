import { ArrowUp, List, Paperclip, SquarePlus, X, type LucideProps } from 'lucide-react';
import { ICON_SIZE_LG, iconProps } from './icon-props.ts';

type IconProps = LucideProps;

export function IconPaperclip(props: IconProps) {
  return <Paperclip {...iconProps({ size: ICON_SIZE_LG, ...props })} />;
}

export function IconSend(props: IconProps) {
  return <ArrowUp {...iconProps(props)} />;
}

export function IconNewSession(props: IconProps) {
  return <SquarePlus {...iconProps({ size: ICON_SIZE_LG, ...props })} />;
}

export function IconSessionHistory(props: IconProps) {
  return <List {...iconProps({ size: ICON_SIZE_LG, ...props })} />;
}

export function IconClose(props: IconProps) {
  return <X {...iconProps(props)} />;
}
