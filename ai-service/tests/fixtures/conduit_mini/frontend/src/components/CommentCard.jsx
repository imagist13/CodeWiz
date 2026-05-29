import React from "react";

function CommentCard({ comment }) {
  return (
    <div className="card">
      <div className="card-block">
        <p className="card-text">{comment.body}</p>
      </div>
      <div className="card-footer">
        <span>{comment.author?.username}</span>
      </div>
    </div>
  );
}

export default CommentCard;
