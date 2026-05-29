import React from "react";

function ArticleDetail({ article }) {
  return (
    <div className="article-detail">
      <h1>{article.title}</h1>
      <div className="article-meta">
        <span>by {article.author?.username}</span>
      </div>
      <div className="article-body">
        <p>{article.body}</p>
      </div>
    </div>
  );
}

export default ArticleDetail;
