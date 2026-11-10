"use client";

import { PostgreSQL, sql } from "@codemirror/lang-sql";
import { EditorView, keymap } from "@codemirror/view";
import { Prec } from "@codemirror/state";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import * as React from "react";
import type { Schema } from "@/lib/api";

export function useIsDark() {
  const [dark, setDark] = React.useState(false);
  React.useEffect(() => {
    const compute = () => {
      const t = document.documentElement.dataset.theme;
      setDark(t ? t === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches);
    };
    compute();
    const obs = new MutationObserver(compute);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

export const SqlEditor = React.forwardRef<
  ReactCodeMirrorRef,
  { value: string; onChange: (v: string) => void; onRun?: () => void; schema?: Schema; minHeight?: string; readOnly?: boolean }
>(function SqlEditor({ value, onChange, onRun, schema, minHeight, readOnly }, ref) {
  const dark = useIsDark();
  const runRef = React.useRef(onRun);
  React.useEffect(() => {
    runRef.current = onRun;
  }, [onRun]);

  const extensions = React.useMemo(() => {
    const sch: Record<string, string[]> = {};
    for (const t of schema?.tables ?? []) sch[t.name] = t.columns.map((c) => c.name);
    return [
      sql({ dialect: PostgreSQL, schema: sch, upperCaseKeywords: true }),
      EditorView.lineWrapping, // soft-wrap: long SQL never forces horizontal scrolling on narrow screens
      Prec.highest(
        // eslint-disable-next-line react-hooks/refs -- the ref is only read when the key is pressed, never during render
        keymap.of([
          {
            key: "Mod-Enter",
            run: () => {
              runRef.current?.();
              return true;
            },
          },
        ]),
      ),
    ];
  }, [schema]);

  return (
    <CodeMirror
      ref={ref}
      value={value}
      onChange={onChange}
      theme={dark ? "dark" : "light"}
      extensions={extensions}
      readOnly={readOnly}
      height="100%"
      minHeight={minHeight}
      basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLine: true, autocompletion: true }}
      className="h-full"
    />
  );
});
