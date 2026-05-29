"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class Comment extends Model {}

  Comment.init({
    body: { type: DataTypes.TEXT, allowNull: false },
  }, {
    sequelize,
    modelName: "Comment",
    tableName: "Comments",
  });

  return Comment;
};
