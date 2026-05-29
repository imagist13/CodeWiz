const router = require("express").Router();
const { Article } = require("../db/models");

router.get("/api/articles", async (req, res) => {
  const articles = await Article.findAll();
  res.json({ articles });
});

router.post("/api/articles", async (req, res) => {
  const article = await Article.create(req.body.article);
  res.json({ article });
});

module.exports = router;
