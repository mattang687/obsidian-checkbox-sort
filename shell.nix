{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  packages = [
    pkgs.nodejs-18_x
    pkgs.nodePackages.npm
    pkgs.nodePackages.rollup
    pkgs.nodePackages.typescript
    pkgs.git
  ];

  shellHook = ''
    export NODE_ENV=development
    echo "Node.js environment ready (node ${pkgs.nodejs-18_x.version})"
  '';
}
