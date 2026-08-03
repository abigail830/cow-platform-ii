import {
  ArrowUp,
  FileText,
  List,
  Loader2,
  Paperclip,
  Square,
  SquarePlus,
  X,
  type LucideProps,
} from 'lucide-react';
import { ICON_SIZE_LG, iconProps } from './icon-props.ts';

type IconProps = LucideProps;

export function IconPaperclip(props: IconProps) {
  return <Paperclip {...iconProps({ size: ICON_SIZE_LG, ...props })} />;
}

export function IconFileText(props: IconProps) {
  return <FileText {...iconProps({ size: ICON_SIZE_LG, ...props })} />;
}

export function IconSend(props: IconProps) {
  return <ArrowUp {...iconProps(props)} />;
}

export function IconStop(props: IconProps) {
  return (
    <Square
      {...iconProps({
        size: 14,
        fill: '#ff6611',
        color: '#ff6611',
        strokeWidth: 0,
        ...props,
      })}
    />
  );
}

export function IconStopSpinner(props: IconProps) {
  return (
    <Loader2
      {...iconProps({
        className: 'icon-btn-spin',
        color: '#ff6611',
        ...props,
      })}
    />
  );
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
