import React, { useState } from "react";

function Profile({ user, articles, favorited }) {
  const [activeTab, setActiveTab] = useState("my_articles");

  return (
    <div className="profile-page">
      <div className="user-info">
        <h4>{user.username}</h4>
      </div>
      <div className="articles-toggle">
        <ul className="nav nav-pills">
          <li className="nav-item">
            <a
              className={activeTab === "my_articles" ? "nav-link active" : "nav-link"}
              onClick={() => setActiveTab("my_articles")}
            >
              My Articles
            </a>
          </li>
          <li className="nav-item">
            <a
              className={activeTab === "favorited" ? "nav-link active" : "nav-link"}
              onClick={() => setActiveTab("favorited")}
            >
              Favorited Articles
            </a>
          </li>
        </ul>
      </div>
      <div className="tab-content">
        {activeTab === "my_articles" && <div>{articles.map(a => a.title)}</div>}
        {activeTab === "favorited" && <div>{favorited.map(a => a.title)}</div>}
      </div>
    </div>
  );
}

export default Profile;
