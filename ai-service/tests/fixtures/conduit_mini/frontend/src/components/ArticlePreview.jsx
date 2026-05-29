import React from "react";

function ArticlePreview({ article }) {
  return (
    <div className="article-preview">
      <h1>{article.title}</h1>
      <p>{article.description}</p>
    </div>
  );
}

export default ArticlePreview;
