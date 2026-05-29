import React, { useState } from "react";

function Editor() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  return (
    <form>
      <input value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} />
    </form>
  );
}

export default Editor;
