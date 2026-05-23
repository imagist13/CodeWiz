"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class Article extends Model {
    static associate(models) {
      Article.belongsTo(models.User, { foreignKey: "userId" });
    }
  }

  Article.init({
    title: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.STRING, allowNull: false },
    body: { type: DataTypes.TEXT, allowNull: false },
    slug: { type: DataTypes.STRING, unique: true },
  }, {
    sequelize,
    modelName: "Article",
    tableName: "Articles",
  });

  return Article;
};
