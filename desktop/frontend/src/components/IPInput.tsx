import { useRef } from "react";

const IPInput = ({
  value,
  onChange,
  onEnter,
}: {
  value: string;
  onChange: (val: string) => void;
  onEnter: () => void;
}) => {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Parse current string into 4 segments (e.g. "192..." -> ["192", "", "", ""])
  const parts = value.split(".");
  const segments = [
    parts[0] || "",
    parts[1] || "",
    parts[2] || "",
    parts[3] || "",
  ];

  const handleChange = (index: number, val: string) => {
    // 1. Only allow numbers
    if (val !== "" && !/^\d+$/.test(val)) return;

    // 2. Strip leading zeros (e.g., "01" becomes "1", "00" becomes "0")
    if (val.length > 1 && val.startsWith("0")) {
      val = parseInt(val, 10).toString();
    }

    // 3. Limit to standard IPv4 max of 255
    if (val !== "" && parseInt(val, 10) > 255) return;

    const newSegments = [...segments];
    newSegments[index] = val;

    const joined = newSegments.join(".");
    // If all are empty, emit standard empty string so the placeholder logic works
    onChange(joined === "..." ? "" : joined);

    // Auto-advance to next box if they type 3 digits
    if (val.length === 3 && index < 3) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      onEnter();
    } else if (e.key === "Backspace" && segments[index] === "" && index > 0) {
      // If empty and user hits backspace, gracefully move to the previous box
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === "." || e.key === " ") {
      // Hitting dot or space jumps to the next box naturally
      e.preventDefault();
      if (index < 3) inputRefs.current[index + 1]?.focus();
    } else if (e.key === "ArrowRight") {
      // Only jump right if cursor is at the very end of the current box
      if (e.currentTarget.selectionStart === segments[index].length && index < 3) {
        e.preventDefault();
        inputRefs.current[index + 1]?.focus();
      }
    } else if (e.key === "ArrowLeft") {
      // Only jump left if cursor is at the very beginning of the current box
      if (e.currentTarget.selectionStart === 0 && index > 0) {
        e.preventDefault();
        inputRefs.current[index - 1]?.focus();
      }
    } else if (/^\d$/.test(e.key)) {
      // ── THE FIX: Native OS Spillover Logic ──
      // Calculate what the value WOULD be if this keystroke went through
      const target = e.currentTarget;
      const start = target.selectionStart || 0;
      const end = target.selectionEnd || 0;
      const currentVal = segments[index];
      const newVal = currentVal.slice(0, start) + e.key + currentVal.slice(end);

      // If the resulting number exceeds 255, intercept it!
      if (parseInt(newVal, 10) > 255) {
        e.preventDefault(); // Stop it from entering the current box
        if (index < 3) {
          inputRefs.current[index + 1]?.focus(); // Jump to next box
          
          const newSegments = [...segments];
          newSegments[index + 1] = e.key; // Overwrite the next box with the spilled digit
          
          const joined = newSegments.join(".");
          onChange(joined === "..." ? "" : joined);
        }
      }
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text");
    
    // Extract up to 4 numbers from whatever they pasted
    const numbers = pasted.match(/\d+/g);
    if (numbers) {
      const newSegments = [...segments];
      numbers.slice(0, 4).forEach((num, i) => {
        const val = parseInt(num, 10);
        newSegments[i] = val <= 255 ? val.toString() : "255";
      });
      
      const joined = newSegments.join(".");
      onChange(joined === "..." ? "" : joined);
      
      // Auto-focus the last filled box
      const focusIndex = Math.min(numbers.length, 3);
      inputRefs.current[focusIndex]?.focus();
    }
  };

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
            ref={(el) => { inputRefs.current[i] = el; }}
            type="text"
            value={seg}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={handlePaste}
            placeholder={i === 0 ? "192" : i === 1 ? "168" : i === 2 ? "254" : "254"}
            maxLength={3}
            className="
              w-7 text-center bg-transparent outline-none
              text-[12px] font-mono text-[#dde4f0] placeholder-[#3d4d63]
            "
          />
          {i < 3 && <span className="text-[#3d4d63] mx-1 font-bold leading-none select-none">.</span>}
        </div>
      ))}
    </div>
  );
}

export default IPInput;