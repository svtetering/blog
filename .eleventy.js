const syntaxHighlight = require("@11ty/eleventy-plugin-syntaxhighlight");
const pluginRss = require("@11ty/eleventy-plugin-rss");
const pluginSEO = require("eleventy-plugin-seo");
const excerpt = require('eleventy-plugin-excerpt');

module.exports = function(eleventyConfig) {
    eleventyConfig.addPlugin(syntaxHighlight);
    eleventyConfig.addPlugin(pluginRss);
    eleventyConfig.addPlugin(pluginSEO, {
        title: "tikveel.nl",
        description: "My thoughts, projects and ideas.",
        url: "https://tikveel.nl",
        author: "Steven van Tetering"
    });
    eleventyConfig.addPlugin(excerpt);

    eleventyConfig.addPassthroughCopy("style");
    eleventyConfig.addWatchTarget("style");

    eleventyConfig.addPassthroughCopy("img");
    eleventyConfig.addWatchTarget("img");
}