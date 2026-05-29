import React from "react";

function Sidebar({ tags }) {
  return (
    <div className="sidebar">
      <p>Popular Tags</p>
      <div className="tag-list">
        {tags.map((tag, index) => (
          <a key={tag} href="#" className="tag-pill">
            {tag}
          </a>
        ))}
      </div>
    </div>
  );
}

export default Sidebar;
