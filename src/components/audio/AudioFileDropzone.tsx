import { useRef, useState } from "react";
import "./AudioFileDropzone.css";

interface AudioFileDropzoneProps {
  onFile: (file: File) => void;
  disabled?: boolean;
}

export function AudioFileDropzone({ onFile, disabled }: AudioFileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [hover, setHover] = useState(false);

  return (
    <div
      className={`hr-dz ${hover ? "hr-dz-hover" : ""} ${disabled ? "hr-dz-disabled" : ""}`}
      onDragOver={(e) => {
        if (disabled) return;
        e.preventDefault();
        setHover(true);
      }}
      onDragLeave={() => setHover(false)}
      onDrop={(e) => {
        if (disabled) return;
        e.preventDefault();
        setHover(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
      onClick={() => !disabled && inputRef.current?.click()}
      role="button"
      tabIndex={0}
    >
      <input
        ref={inputRef}
        type="file"
        accept="audio/*"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
      <div className="hr-dz-text">
        <span className="hr-dz-title">Drop audio file</span>
        <span className="hr-dz-sub">or click to browse · wav / mp3 / m4a / ogg</span>
      </div>
    </div>
  );
}
