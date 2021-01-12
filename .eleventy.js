const syntaxHighlight = require("@11ty/eleventy-plugin-syntaxhighlight");

module.exports = function(eleventyConfig) {
    eleventyConfig.addPlugin(syntaxHighlight);

    eleventyConfig.addShortcode('excerpt', post => extractExcerpt(post));

    eleventyConfig.addPassthroughCopy("style");
    eleventyConfig.addWatchTarget("style");

    eleventyConfig.addPassthroughCopy("img");
    eleventyConfig.addWatchTarget("img");
}

function extractExcerpt(doc) {
    if (!doc.hasOwnProperty('templateContent')) {
        console.warn('❌ Failed to extract excerpt: Document has no property `templateContent`.');
        return;
    }
  
    const excerptSeparator = '<!--more-->';
    const content = doc.templateContent;
  
    if (content.includes(excerptSeparator)) {
        return content.substring(0, content.indexOf(excerptSeparator)).trim();
    }
  
    const pCloseTag = '</p>';
    if (content.includes(pCloseTag)) {
        return content.substring(0, content.indexOf(pCloseTag) + pCloseTag.length);
    }
  
    return content;
}