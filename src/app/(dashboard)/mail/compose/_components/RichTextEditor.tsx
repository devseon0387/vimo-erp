'use client';

import { useCallback, useMemo } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Link from '@tiptap/extension-link';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  List,
  ListOrdered,
  Link as LinkIcon,
  Undo2,
  Redo2,
} from 'lucide-react';

interface RichTextEditorProps {
  onChangeRef: React.RefObject<((html: string) => void) | null>;
}

function ToolbarButton({
  onClick,
  active,
  disabled,
  children,
  title,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '32px',
        height: '32px',
        borderRadius: '6px',
        border: 'none',
        cursor: disabled ? 'default' : 'pointer',
        background: active ? '#fef4ed' : 'transparent',
        color: active ? '#f97316' : disabled ? '#d6d3d1' : '#57534e',
        transition: 'all 0.15s',
      }}
      onMouseEnter={(e) => {
        if (!active && !disabled) e.currentTarget.style.background = '#f5f3f1';
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = 'transparent';
      }}
    >
      {children}
    </button>
  );
}

function Separator() {
  return (
    <div
      style={{
        width: '1px',
        height: '20px',
        background: '#e7e5e4',
        margin: '0 4px',
      }}
    />
  );
}

const editorStyles = `
  .tiptap-editor .tiptap {
    padding: 12px;
    min-height: 280px;
    outline: none;
    font-size: 14px;
    line-height: 1.6;
    color: #1c1917;
  }
  .tiptap-editor .tiptap p {
    margin: 0 0 0.5em 0;
  }
  .tiptap-editor .tiptap p:last-child {
    margin-bottom: 0;
  }
  .tiptap-editor .tiptap ul,
  .tiptap-editor .tiptap ol {
    padding-left: 1.5em;
    margin: 0.5em 0;
  }
  .tiptap-editor .tiptap ul {
    list-style-type: disc;
  }
  .tiptap-editor .tiptap ol {
    list-style-type: decimal;
  }
  .tiptap-editor .tiptap a {
    color: #f97316;
    text-decoration: underline;
    cursor: pointer;
  }
  .tiptap-editor .tiptap p.is-editor-empty:first-child::before {
    content: '이메일 본문을 입력하세요';
    color: #a8a29e;
    float: left;
    height: 0;
    pointer-events: none;
  }
`;

export default function RichTextEditor({ onChangeRef }: RichTextEditorProps) {
  const extensions = useMemo(
    () => [
      StarterKit,
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Link.configure({ openOnClick: false }),
    ],
    [],
  );

  const editor = useEditor({
    extensions,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      onChangeRef.current?.(editor.getHTML());
    },
  });

  const addLink = useCallback(() => {
    if (!editor) return;
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('URL을 입력하세요', previousUrl || 'https://');
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }, [editor]);

  if (!editor) return null;

  return (
    <div style={{ border: '1px solid #d6d3d1', borderRadius: '8px', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '2px',
          padding: '6px 8px',
          borderBottom: '1px solid #e7e5e4',
          background: '#fafaf9',
        }}
      >
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive('bold')}
          title="굵게"
        >
          <Bold size={16} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive('italic')}
          title="기울임"
        >
          <Italic size={16} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          active={editor.isActive('underline')}
          title="밑줄"
        >
          <UnderlineIcon size={16} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleStrike().run()}
          active={editor.isActive('strike')}
          title="취소선"
        >
          <Strikethrough size={16} />
        </ToolbarButton>

        <Separator />

        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
          active={editor.isActive({ textAlign: 'left' })}
          title="왼쪽 정렬"
        >
          <AlignLeft size={16} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
          active={editor.isActive({ textAlign: 'center' })}
          title="가운데 정렬"
        >
          <AlignCenter size={16} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
          active={editor.isActive({ textAlign: 'right' })}
          title="오른쪽 정렬"
        >
          <AlignRight size={16} />
        </ToolbarButton>

        <Separator />

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive('bulletList')}
          title="글머리 기호"
        >
          <List size={16} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive('orderedList')}
          title="번호 매기기"
        >
          <ListOrdered size={16} />
        </ToolbarButton>

        <Separator />

        <ToolbarButton
          onClick={addLink}
          active={editor.isActive('link')}
          title="링크"
        >
          <LinkIcon size={16} />
        </ToolbarButton>

        <Separator />

        <ToolbarButton
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          title="실행 취소"
        >
          <Undo2 size={16} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          title="다시 실행"
        >
          <Redo2 size={16} />
        </ToolbarButton>
      </div>

      {/* Editor */}
      <style>{editorStyles}</style>
      <div className="tiptap-editor">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
