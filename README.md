# tiny-stack-vm-01 entry

Node 22 interpreter of make.fun's tiny stack ISA (the kit's `generator/subject/ISA.md`): no dependencies, no
WebAssembly. It answers a whole set in one run:

    node main.ts

It reads `/input/<id>/program.bin` with `/input/<id>/input.bin` and writes `/output/<id>/stdout.bin` (the bytes the
program wrote) and `/output/<id>/exit.txt` (its exit code, decimal, a trap's code included), creating `/output/<id>/`.
Outside a container `MAKEFUN_INPUT_DIR` and `MAKEFUN_OUTPUT_DIR` stand in for those two mounts.

A 256-entry table packs each opcode's immediate size, pops and pushes, so the stack checks and the immediate bounds
check run before the instruction's own rule, in ISA.md's order; a trap ends the program, its code is the exit code, and
the output written before it is kept. Verified against the reference `vm.mjs` on all 40 practice instances, on 1600
instances drawn with the kit's generator and on 4000 random bytecode programs: byte-identical output and exit code.
