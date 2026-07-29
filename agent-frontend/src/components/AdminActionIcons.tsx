import { Download, Eye, FolderInput, Pencil, Trash2, type LucideProps } from 'lucide-react';
import { iconProps } from './icons/icon-props.ts';

type IconProps = LucideProps;

export function IconEdit(props: IconProps) {
  return <Pencil {...iconProps(props)} />;
}

export function IconDelete(props: IconProps) {
  return <Trash2 {...iconProps(props)} />;
}

export function IconView(props: IconProps) {
  return <Eye {...iconProps(props)} />;
}

export function IconDownload(props: IconProps) {
  return <Download {...iconProps(props)} />;
}

export function IconMove(props: IconProps) {
  return <FolderInput {...iconProps(props)} />;
}
