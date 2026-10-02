(function (root) {
  "use strict";

  var TD = root.TD || (root.TD = {});
  // 在显示层同步 CSS 底色，冻结版本中的规则与文件保持原样。
  TD.applyPagePalette = function () {
    if (!TD.config || !TD.config.PALETTE) return;
    var styles = root.getComputedStyle(document.body);
    var tokens = { bone: "--tk-bone", boneWarm: "--tk-bone-warm", file: "--tk-file" };
    Object.keys(tokens).forEach(function (key) {
      var color = styles.getPropertyValue(tokens[key]).trim();
      if (color) TD.config.PALETTE[key] = color;
    });
  };

  TD.applyPagePalette();
})(window);
