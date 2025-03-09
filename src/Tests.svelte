<script>


  let test = 0;

  class rec_class {
    parm1 = "test";
    parm2 = 0;
    parm3 = $state(0);

    constructor() {
      $effect(() => {
        console.log("parm1", this.parm1);
        console.log("parm2", this.parm2);
        console.log("parm3", this.parm3);
      });
    }

  }


  let rec = new rec_class();

  $inspect(rec);

  function Test() {
    rec.parm2 = 2;
    rec.parm3 = 2;
  }

</script>

<div>
  <h1>Test</h1>
  <p>parm1: {rec.parm1}</p>
  <p>parm2: {rec.parm2}</p>
  <p>parm3: {rec.parm3}</p>
  </div>

<button onclick={Test}>Test</button>
