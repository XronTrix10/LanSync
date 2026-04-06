import { useRef } from "react";

type Props = {
  value: string;
  onChange: (val: string) => void;
  onEnter: () => void;
};

const IPInput = ({ value, onChange, onEnter }: Props) => {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const getSegments = () => {
    const parts = value.split(".");
    return [
      parts[0] || "",
      parts[1] || "",
      parts[2] || "",
      parts[3] || "",
    ];
  };

  const joinSegments = (segments: string[]) => {
    const joined = segments.join(".");
    return joined === "..." ? "" : joined;
  };

  const handleChange = (index: number, val: string) => {
    const segments = getSegments();

    // Allow only digits
    if (val !== "" && !/^\d+$/.test(val)) return;

    // Strip leading zeros
    if (val.length > 1 && val.startsWith("0")) {
      val = parseInt(val, 10).toString();
    }

    // Max 255
    if (val !== "" && parseInt(val, 10) > 255) return;

    const newSegments = [...segments];
    newSegments[index] = val;

    onChange(joinSegments(newSegments));

    // Auto move forward
    if (val.length === 3 && index < 3) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>
  ) => {
    const segments = getSegments();

    if (e.key === "Enter") {
      onEnter();
      return;
    }

    if (e.key === "Backspace") {
      if (segments[index] === "" && index > 0) {
        inputRefs.current[index - 1]?.focus();
      }
      return;
    }

    if (e.key === "." || e.key === " ") {
      e.preventDefault();
      if (index < 3) inputRefs.current[index + 1]?.focus();
      return;
    }

    if (e.key === "ArrowRight") {
      const el = e.currentTarget;
      if (el.selectionStart === segments[index].length && index < 3) {
        e.preventDefault();
        inputRefs.current[index + 1]?.focus();
      }
      return;
    }

    if (e.key === "ArrowLeft") {
      const el = e.currentTarget;
      if (el.selectionStart === 0 && index > 0) {
        e.preventDefault();
        inputRefs.current[index - 1]?.focus();
      }
      return;
    }

    // Spillover logic
    if (/^\d$/.test(e.key)) {
      const el = e.currentTarget;
      const start = el.selectionStart ?? 0;
      const end = el.selectionEnd ?? 0;
      const currentVal = segments[index];

      const newVal =
        currentVal.slice(0, start) + e.key + currentVal.slice(end);

      if (parseInt(newVal, 10) > 255) {
        e.preventDefault();

        if (index < 3) {
          const newSegments = [...segments];

          // Move to next box
          inputRefs.current[index + 1]?.focus();

          // Put digit into next segment
          newSegments[index + 1] = e.key;

          onChange(joinSegments(newSegments));
        }
      }
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();

    const pasted = e.clipboardData.getData("text");
    const numbers = pasted.match(/\d+/g);

    if (!numbers) return;

    const newSegments = ["", "", "", ""];

    numbers.slice(0, 4).forEach((num, i) => {
      const val = Math.min(parseInt(num, 10), 255);
      newSegments[i] = val.toString();
    });

    onChange(joinSegments(newSegments));

    const focusIndex = Math.min(numbers.length - 1, 3);
    inputRefs.current[focusIndex]?.focus();
  };

  const segments = getSegments();

  return (
    <div
      className="
        flex items-center justify-between w-full px-3 py-1.5
        bg-bg-base border border-[#1e2535] rounded-lg
        focus-within:border-accent focus-within:ring-1 focus-within:ring-accent/20
        transition-all cursor-text
      "
      onClick={() => inputRefs.current[0]?.focus()}
    >
      {segments.map((seg, i) => (
        <div key={i} className="flex items-center">
          <input
            ref={(el) => {
              inputRefs.current[i] = el;
            }}
            type="text"
            value={seg}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={handlePaste}
            placeholder={
              i === 0
                ? "192"
                : i === 1
                  ? "168"
                  : i === 2
                    ? "0"
                    : "1"
            }
            maxLength={3}
            className="
              w-7 text-center bg-transparent outline-none
              text-[12px] font-mono text-[#dde4f0] placeholder-[#3d4d63]
            "
          />
          {i < 3 && (
            <span className="text-[#3d4d63] mx-1 font-bold leading-none select-none">
              .
            </span>
          )}
        </div>
      ))}
    </div>
  );
};

export default IPInput;
